package com.toolweb.platform.tool.httpdiagnostics.service;

import com.toolweb.platform.tool.execution.exception.ToolInputException;
import com.toolweb.platform.tool.execution.exception.ToolCapacityException;
import com.toolweb.platform.tool.execution.exception.ToolUpstreamException;
import com.toolweb.platform.tool.httpdiagnostics.config.HttpDiagnosticsProperties;
import com.toolweb.platform.tool.httpdiagnostics.policy.OutboundTargetPolicy;
import com.toolweb.platform.tool.httpdiagnostics.transport.RecordingTlsSocketStrategy;
import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.protocol.HttpClientContext;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.client5.http.impl.io.ManagedHttpClientConnectionFactory;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.classic.methods.HttpHead;
import org.apache.hc.client5.http.classic.methods.HttpUriRequestBase;
import org.apache.hc.core5.http.Header;
import org.apache.hc.core5.http.config.Http1Config;
import org.apache.hc.core5.util.Timeout;
import org.apache.hc.client5.http.ssl.DefaultClientTlsStrategy;
import org.springframework.stereotype.Service;

import java.io.InterruptedIOException;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

import static com.toolweb.platform.tool.httpdiagnostics.dto.HttpDiagnosticsModels.*;

@Service
public class HttpDiagnosticsService {

    private static final Set<Integer> REDIRECT_STATUSES = Set.of(301, 302, 303, 307, 308);
    private static final Set<String> FORBIDDEN_API_KEY_HEADERS = Set.of(
            "authorization", "proxy-authorization", "cookie", "host", "content-length",
            "connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade",
            "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto");
    private static final String DEFAULT_USER_AGENT = "ToolWeb-HTTP-Diagnostics/1.0";

    private final HttpDiagnosticsProperties properties;
    private final OutboundTargetPolicy targetPolicy;
    private final Semaphore capacity;

    public HttpDiagnosticsService(HttpDiagnosticsProperties properties, OutboundTargetPolicy targetPolicy) {
        this.properties = properties;
        this.targetPolicy = targetPolicy;
        this.capacity = new Semaphore(properties.maxConcurrentRequests(), true);
    }

    public Result inspect(Request input, String requestId) {
        if (!capacity.tryAcquire()) {
            throw new ToolCapacityException("当前诊断请求较多，请稍后重试");
        }
        try {
            return inspectWithinBudget(input, requestId);
        } finally {
            capacity.release();
        }
    }

    private Result inspectWithinBudget(Request input, String requestId) {
        var method = Optional.ofNullable(input.method()).orElse("GET").toUpperCase(Locale.ROOT);
        var followRedirects = !Boolean.FALSE.equals(input.followRedirects());
        var maxRedirects = Math.min(Optional.ofNullable(input.maxRedirects()).orElse(properties.maxRedirects()), properties.maxRedirects());
        var timeoutMs = Math.min(Optional.ofNullable(input.timeoutMs()).orElse((int) properties.responseTimeout().toMillis()), 20_000);
        var current = input.url();
        String requestedUrl = null;
        var authentication = validateAuthentication(input.authentication());
        RequestOrigin credentialOrigin = null;
        var redirects = new ArrayList<RedirectHop>();
        var findings = new ArrayList<Finding>();
        var resolvedAddresses = new ArrayList<String>();
        var tlsHandshakes = new ArrayList<TlsHandshake>();
        var totalDnsMs = 0L;
        var totalRequestMs = 0L;
        var totalStarted = System.nanoTime();
        var deadline = totalStarted + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        var credentialStripped = false;
        var credentialSentToFinalOrigin = false;
        var inputFragmentRemoved = false;
        var trustedPrivateTarget = false;
        ResponseSnapshot finalResponse;

        while (true) {
            var target = targetPolicy.validate(current);
            if (requestedUrl == null) {
                requestedUrl = target.uri().toASCIIString();
                inputFragmentRemoved = target.fragmentRemoved();
            }
            trustedPrivateTarget |= target.trustedPrivateTarget();
            if (credentialOrigin == null) {
                credentialOrigin = RequestOrigin.from(target.uri());
                if (authentication.configured() && credentialOrigin.scheme().equals("http") && !properties.allowPrivateTargets()) {
                    throw new ToolInputException("包含用户凭证的诊断仅支持 HTTPS", List.of("url: 不允许通过明文 HTTP 发送凭证"));
                }
            }
            var sendCredentials = authentication.configured()
                    && credentialOrigin.equals(RequestOrigin.from(target.uri()));
            credentialStripped |= authentication.configured() && !sendCredentials;
            totalDnsMs += target.dnsMs();
            resolvedAddresses.addAll(Arrays.stream(target.addresses()).map(InetAddress::getHostAddress).toList());
            var requestStarted = System.nanoTime();
            var remainingMs = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
            if (remainingMs <= 0) {
                throw new ToolUpstreamException("本次诊断已超过总超时预算", true, null);
            }
            var response = execute(target, method, (int) Math.max(1, remainingMs), input.acceptLanguage(), input.userAgent(),
                    authentication, sendCredentials, tlsHandshakes.size() + 1);
            var requestMs = elapsedMs(requestStarted);
            totalRequestMs += requestMs;
            finalResponse = response;
            response.tlsHandshake().ifPresent(tlsHandshakes::add);
            credentialSentToFinalOrigin = sendCredentials;

            var location = response.firstHeader("location");
            if (!followRedirects || !REDIRECT_STATUSES.contains(response.status()) || location == null) {
                current = target.uri().toASCIIString();
                break;
            }
            if (redirects.size() >= maxRedirects) {
                findings.add(new Finding("warning", "重定向未完成", "已达到配置的最大重定向次数。"));
                current = target.uri().toASCIIString();
                break;
            }

            final URI resolved;
            try {
                resolved = target.uri().resolve(location);
            } catch (IllegalArgumentException exception) {
                findings.add(new Finding("warning", "重定向地址无效", "Location 响应头无法解析。"));
                current = target.uri().toASCIIString();
                break;
            }
            redirects.add(new RedirectHop(
                    redirects.size() + 1,
                    target.uri().toASCIIString(),
                    response.status(),
                    location,
                    resolved.toASCIIString(),
                    requestMs));
            current = resolved.toASCIIString();
        }

        var headers = sanitizeHeaders(finalResponse.headers());
        var compression = analyzeCompression(headers);
        var cache = analyzeCache(headers, method, finalResponse.status());
        var security = analyzeSecurity(current, headers);
        var cors = analyzeCors(headers);
        var response = analyzeResponse(headers);
        var authenticationAnalysis = analyzeAuthentication(authentication, credentialSentToFinalOrigin, credentialStripped);
        var tls = analyzeTls(tlsHandshakes);
        addFindings(findings, finalResponse.status(), compression, cache, security, cors, response,
                authenticationAnalysis, tls, redirects.size(), inputFragmentRemoved, trustedPrivateTarget);
        var totalMs = elapsedMs(totalStarted);

        return new Result(
                requestedUrl,
                current,
                method,
                finalResponse.status(),
                finalResponse.reasonPhrase(),
                finalResponse.protocol(),
                resolvedAddresses.stream().distinct().toList(),
                List.copyOf(redirects),
                headers,
                compression,
                cache,
                security,
                cors,
                response,
                authenticationAnalysis,
                tls,
                new TimingAnalysis(totalDnsMs, totalRequestMs, totalMs, redirects.size(),
                        "连接与响应头耗时包含 TCP/TLS 建连、服务端处理及首个响应头等待时间。"),
                List.copyOf(findings),
                Instant.now(),
                requestId);
    }

    private ResponseSnapshot execute(
            OutboundTargetPolicy.ValidatedTarget target,
            String method,
            int timeoutMs,
            String acceptLanguage,
            String userAgent,
            AuthenticationContext authentication,
            boolean sendCredentials,
            int tlsSequence
    ) {
        var timeout = Timeout.ofMilliseconds(timeoutMs);
        var connectionConfig = ConnectionConfig.custom()
                .setConnectTimeout(Timeout.ofMilliseconds(Math.min(properties.connectTimeout().toMillis(), timeoutMs)))
                .setSocketTimeout(timeout)
                .build();
        var tlsRecorder = new RecordingTlsSocketStrategy(
                DefaultClientTlsStrategy.createDefault(), tlsSequence, target.uri());
        var manager = PoolingHttpClientConnectionManagerBuilder.create()
                .setConnectionFactory(ManagedHttpClientConnectionFactory.builder()
                        .http1Config(Http1Config.custom()
                                .setMaxHeaderCount(properties.maxResponseHeaders())
                                .setMaxLineLength(properties.maxHeaderValueLength())
                                .build())
                        .build())
                .setDnsResolver(new PinnedDnsResolver(target.uri().getHost(), target.addresses()))
                .setTlsSocketStrategy(tlsRecorder)
                .setDefaultConnectionConfig(connectionConfig)
                .setMaxConnTotal(1)
                .setMaxConnPerRoute(1)
                .build();
        var requestConfig = RequestConfig.custom()
                .setConnectionRequestTimeout(Timeout.ofSeconds(1))
                .setResponseTimeout(timeout)
                .build();

        try (CloseableHttpClient client = HttpClients.custom()
                .setConnectionManager(manager)
                .setDefaultRequestConfig(requestConfig)
                .disableRedirectHandling()
                .disableAutomaticRetries()
                .disableCookieManagement()
                .disableAuthCaching()
                .disableContentCompression()
                .setUserAgent(cleanHeaderValue(userAgent, DEFAULT_USER_AGENT))
                .build()) {
            HttpUriRequestBase request = method.equals("HEAD") ? new HttpHead(target.uri()) : new HttpGet(target.uri());
            request.setHeader("Accept", "*/*");
            request.setHeader("Accept-Encoding", "gzip, deflate, br");
            var language = cleanHeaderValue(acceptLanguage, null);
            if (language != null) {
                request.setHeader("Accept-Language", language);
            }
            if (sendCredentials) {
                applyAuthentication(request, authentication);
            }
            try (var response = client.executeOpen(null, request, HttpClientContext.create())) {
                return new ResponseSnapshot(
                        response.getCode(),
                        Optional.ofNullable(response.getReasonPhrase()).orElse(""),
                        response.getVersion().toString(),
                        List.of(response.getHeaders()),
                        tlsRecorder.handshake());
            }
        } catch (SocketTimeoutException | org.apache.hc.core5.http.ConnectionRequestTimeoutException exception) {
            throw new ToolUpstreamException("目标站点响应超时", true, exception);
        } catch (InterruptedIOException exception) {
            throw new ToolUpstreamException("请求被中断或超时", true, exception);
        } catch (Exception exception) {
            throw new ToolUpstreamException("无法连接目标站点", false, exception);
        }
    }

    private AuthenticationContext validateAuthentication(Authentication authentication) {
        if (authentication == null || authentication.type() == null || authentication.type().isBlank()
                || authentication.type().equalsIgnoreCase("NONE")) {
            return AuthenticationContext.none();
        }
        var type = authentication.type().toUpperCase(Locale.ROOT);
        var username = cleanCredentialValue(authentication.username());
        var secret = cleanCredentialValue(authentication.secret());
        var headerName = authentication.headerName() == null ? null : authentication.headerName().strip();
        if (secret == null) {
            throw new ToolInputException("请输入认证凭证", List.of("authentication.secret: 不能为空"));
        }
        if (type.equals("BASIC") && username == null) {
            throw new ToolInputException("请输入 Basic Auth 用户名", List.of("authentication.username: 不能为空"));
        }
        if (type.equals("BASIC") && username.indexOf(':') >= 0) {
            throw new ToolInputException("Basic Auth 用户名不能包含冒号", List.of("authentication.username: 包含非法分隔符"));
        }
        if (type.equals("API_KEY")) {
            if (headerName == null || headerName.isBlank()) {
                throw new ToolInputException("请输入 API Key 请求头名称", List.of("authentication.headerName: 不能为空"));
            }
            if (!headerName.matches("[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}")) {
                throw new ToolInputException("API Key 请求头名称不合法", List.of("authentication.headerName: 仅允许标准请求头字符"));
            }
            if (FORBIDDEN_API_KEY_HEADERS.contains(headerName.toLowerCase(Locale.ROOT))) {
                throw new ToolInputException("该请求头不能用于 API Key", List.of("authentication.headerName: 使用专用 API Key 请求头，例如 X-API-Key"));
            }
        }
        return new AuthenticationContext(type, username, secret, headerName);
    }

    private String cleanCredentialValue(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
            throw new ToolInputException("认证凭证不允许包含换行符", List.of("authentication: 包含非法换行符"));
        }
        return value;
    }

    private void applyAuthentication(HttpUriRequestBase request, AuthenticationContext authentication) {
        switch (authentication.type()) {
            case "BASIC" -> {
                var raw = authentication.username() + ":" + authentication.secret();
                request.setHeader("Authorization", "Basic " + Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8)));
            }
            case "BEARER" -> request.setHeader("Authorization", "Bearer " + authentication.secret());
            case "API_KEY" -> request.setHeader(authentication.headerName(), authentication.secret());
            default -> {
                // NONE is represented by a non-configured context and never reaches this branch.
            }
        }
    }

    private String cleanHeaderValue(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        if (value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
            throw new ToolInputException("请求头不允许包含换行符", List.of("header: 包含非法换行符"));
        }
        return value.strip();
    }

    private List<HeaderEntry> sanitizeHeaders(List<Header> source) {
        return source.stream()
                .limit(properties.maxResponseHeaders())
                .map(header -> new HeaderEntry(header.getName(), truncate(header.getValue())))
                .toList();
    }

    private String truncate(String value) {
        if (value.length() <= properties.maxHeaderValueLength()) {
            return value;
        }
        return value.substring(0, properties.maxHeaderValueLength()) + "…";
    }

    private CompressionAnalysis analyzeCompression(List<HeaderEntry> headers) {
        var encoding = firstHeader(headers, "content-encoding");
        var contentType = firstHeader(headers, "content-type");
        var contentLength = parseLong(firstHeader(headers, "content-length"));
        var vary = Optional.ofNullable(firstHeader(headers, "vary"))
                .map(value -> value.toLowerCase(Locale.ROOT).contains("accept-encoding"))
                .orElse(false);
        var compressed = encoding != null && !encoding.equalsIgnoreCase("identity");
        return new CompressionAnalysis(
                compressed,
                encoding == null ? "identity / 未声明" : encoding,
                contentType == null ? "未声明" : contentType,
                contentLength,
                vary,
                compressed ? "响应使用了 %s 压缩。".formatted(encoding) : "响应未声明内容压缩。"
        );
    }

    private CacheAnalysis analyzeCache(List<HeaderEntry> headers, String method, int status) {
        var cacheControl = firstHeader(headers, "cache-control");
        var directives = parseDirectives(cacheControl);
        var pragma = firstHeader(headers, "pragma");
        var noStore = directives.containsKey("no-store");
        var noCache = directives.containsKey("no-cache") || "no-cache".equalsIgnoreCase(pragma);
        var isPrivate = directives.containsKey("private");
        var freshness = parseLong(Optional.ofNullable(directives.get("s-maxage"))
                .orElse(directives.get("max-age")));
        var cacheableStatus = Set.of(200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501).contains(status);
        var browserCacheable = method.equals("GET") && cacheableStatus && !noStore;
        var sharedCacheable = browserCacheable && !isPrivate;
        var etag = firstHeader(headers, "etag");
        var lastModified = firstHeader(headers, "last-modified");
        var validator = etag != null ? "ETag" : lastModified != null ? "Last-Modified" : "无";
        var summary = noStore ? "明确禁止缓存。"
                : noCache ? "允许存储，但复用前必须重新验证。"
                : freshness != null ? "显式新鲜期为 %d 秒。".formatted(freshness)
                : "未声明明确的新鲜期，缓存行为由客户端启发式决定。";
        return new CacheAnalysis(
                cacheControl == null ? "未声明" : cacheControl,
                browserCacheable,
                sharedCacheable,
                freshness,
                !validator.equals("无"),
                validator,
                summary);
    }

    private SecurityAnalysis analyzeSecurity(String finalUrl, List<HeaderEntry> headers) {
        var https = URI.create(finalUrl).getScheme().equalsIgnoreCase("https");
        var contentType = Optional.ofNullable(firstHeader(headers, "content-type")).orElse("").toLowerCase(Locale.ROOT);
        var html = contentType.contains("text/html") || contentType.contains("application/xhtml");
        var hsts = firstHeader(headers, "strict-transport-security");
        var csp = firstHeader(headers, "content-security-policy");
        var nosniff = firstHeader(headers, "x-content-type-options");
        var xFrame = firstHeader(headers, "x-frame-options");
        var referrer = firstHeader(headers, "referrer-policy");
        var permissions = firstHeader(headers, "permissions-policy");
        var controls = new ArrayList<ControlAssessment>();
        var score = 20;
        controls.add(new ControlAssessment("传输加密", https ? "pass" : "warning",
                https ? "最终地址使用 HTTPS。" : "最终地址仍使用明文 HTTP。"));
        if (!https) score -= 20;
        controls.add(new ControlAssessment("HSTS", !https ? "not-applicable" : hsts != null ? "pass" : "warning",
                !https ? "仅对 HTTPS 响应生效。" : hsts != null ? "浏览器被指示仅通过 HTTPS 访问。" : "HTTPS 响应未声明 Strict-Transport-Security。"));
        if (https && hsts != null) score += 20;
        controls.add(new ControlAssessment("内容安全策略", !html ? "not-applicable" : csp != null ? "pass" : "warning",
                !html ? "当前内容类型不是 HTML，不作为必要项评分。" : csp != null ? "已声明 Content-Security-Policy。" : "HTML 响应未声明 Content-Security-Policy。"));
        if (!html || csp != null) score += 20;
        var hasNosniff = nosniff != null && nosniff.equalsIgnoreCase("nosniff");
        controls.add(new ControlAssessment("MIME 嗅探防护", hasNosniff ? "pass" : "warning",
                hasNosniff ? "已通过 nosniff 禁止类型猜测。" : "未检测到 X-Content-Type-Options: nosniff。"));
        if (hasNosniff) score += 15;
        var framed = xFrame != null || (csp != null && csp.toLowerCase(Locale.ROOT).contains("frame-ancestors"));
        controls.add(new ControlAssessment("嵌入限制", !html ? "not-applicable" : framed ? "pass" : "info",
                !html ? "非 HTML 内容通常无需页面嵌入限制。" : framed ? "已声明页面嵌入限制。" : "未检测到 X-Frame-Options 或 CSP frame-ancestors。"));
        if (!html || framed) score += 10;
        controls.add(new ControlAssessment("引用来源策略", referrer != null ? "pass" : "info",
                referrer != null ? "已声明 Referrer-Policy。" : "未声明 Referrer-Policy。"));
        if (referrer != null) score += 10;
        controls.add(new ControlAssessment("浏览器能力策略", permissions != null ? "pass" : "info",
                permissions != null ? "已声明 Permissions-Policy。" : "未声明 Permissions-Policy。"));
        if (permissions != null) score += 5;

        var cookies = allHeaders(headers, "set-cookie");
        var weakCookies = (int) cookies.stream().filter(value -> {
            var normalized = value.toLowerCase(Locale.ROOT);
            return !normalized.contains("httponly") || !normalized.contains("samesite=") || (https && !normalized.contains("secure"));
        }).count();
        var boundedScore = Math.max(0, Math.min(100, score));
        var grade = boundedScore >= 90 ? "A" : boundedScore >= 75 ? "B" : boundedScore >= 60 ? "C" : boundedScore >= 40 ? "D" : "F";
        return new SecurityAnalysis(boundedScore, grade, true, List.copyOf(controls), cookies.size(), weakCookies,
                "这是基于响应头覆盖情况的启发式评分，不等同于漏洞扫描或合规审计。");
    }

    private CorsAnalysis analyzeCors(List<HeaderEntry> headers) {
        var origin = firstHeader(headers, "access-control-allow-origin");
        var credentials = "true".equalsIgnoreCase(firstHeader(headers, "access-control-allow-credentials"));
        var permissive = "*".equals(origin);
        var configured = origin != null;
        var summary = !configured ? "未检测到跨域资源共享策略；这不影响服务端直连，但浏览器跨域调用可能受限。"
                : permissive && credentials ? "同时声明通配来源与凭证，浏览器不会接受这组组合，建议回显明确来源。"
                : permissive ? "允许任意来源读取不含凭证的跨域响应。"
                : credentials ? "仅允许指定来源，并允许浏览器携带凭证。"
                : "仅允许声明的来源进行跨域读取。";
        return new CorsAnalysis(configured, origin == null ? "未声明" : origin, credentials,
                valueOrMissing(firstHeader(headers, "access-control-allow-methods")),
                valueOrMissing(firstHeader(headers, "access-control-allow-headers")),
                valueOrMissing(firstHeader(headers, "access-control-expose-headers")), permissive, summary);
    }

    private ResponseProfile analyzeResponse(List<HeaderEntry> headers) {
        var contentType = firstHeader(headers, "content-type");
        var charset = "未声明";
        if (contentType != null) {
            for (var part : contentType.split(";")) {
                var trimmed = part.strip();
                if (trimmed.toLowerCase(Locale.ROOT).startsWith("charset=")) {
                    charset = trimmed.substring("charset=".length()).replace("\"", "");
                }
            }
        }
        var server = valueOrMissing(firstHeader(headers, "server"));
        var poweredBy = valueOrMissing(firstHeader(headers, "x-powered-by"));
        var transfer = valueOrMissing(firstHeader(headers, "transfer-encoding"));
        var connection = valueOrMissing(firstHeader(headers, "connection"));
        var disposition = valueOrMissing(firstHeader(headers, "content-disposition"));
        var age = parseLong(firstHeader(headers, "age"));
        var cookies = allHeaders(headers, "set-cookie").size();
        var summary = !server.equals("未声明") || !poweredBy.equals("未声明")
                ? "响应公开了部分服务端实现信息，可结合运维需要评估是否隐藏。"
                : "未发现明显的服务端实现标识。";
        return new ResponseProfile(valueOrMissing(contentType), charset, transfer, connection, server, poweredBy, disposition, age, cookies, summary);
    }

    private AuthenticationAnalysis analyzeAuthentication(AuthenticationContext authentication, boolean sentToFinalOrigin, boolean stripped) {
        if (!authentication.configured()) {
            return new AuthenticationAnalysis(false, "NONE", false, false, "本次请求未包含用户凭证。");
        }
        var summary = stripped
                ? "凭证仅发送给原始来源；检测到跨来源重定向后已自动剥离。"
                : "凭证仅发送给原始来源，并且不会写入诊断结果或持久化存储。";
        return new AuthenticationAnalysis(true, authentication.type(), sentToFinalOrigin, stripped, summary);
    }

    private TlsAnalysis analyzeTls(List<TlsHandshake> handshakes) {
        var immutable = List.copyOf(handshakes);
        var totalHandshakeMs = immutable.stream().mapToLong(TlsHandshake::handshakeMs).sum();
        if (immutable.isEmpty()) {
            return new TlsAnalysis(false, 0, 0, immutable, "本次请求未使用 TLS，未发生 HTTPS 握手。");
        }
        var finalHandshake = immutable.getLast();
        return new TlsAnalysis(true, immutable.size(), totalHandshakeMs, immutable,
                "完成 %d 次 TLS 握手；最终连接使用 %s，证书由 %s 签发。"
                        .formatted(immutable.size(), finalHandshake.protocol(), finalHandshake.issuerOrganization()));
    }

    private Map<String, String> parseDirectives(String value) {
        var result = new LinkedHashMap<String, String>();
        if (value == null) {
            return result;
        }
        for (var token : value.split(",")) {
            var parts = token.strip().split("=", 2);
            result.put(parts[0].toLowerCase(Locale.ROOT), parts.length == 2 ? parts[1].replace("\"", "").strip() : "");
        }
        return result;
    }

    private void addFindings(
            List<Finding> findings,
            int status,
            CompressionAnalysis compression,
            CacheAnalysis cache,
            SecurityAnalysis security,
            CorsAnalysis cors,
            ResponseProfile response,
            AuthenticationAnalysis authentication,
            TlsAnalysis tls,
            int redirectCount,
            boolean inputFragmentRemoved,
            boolean trustedPrivateTarget
    ) {
        findings.add(new Finding(status < 400 ? "success" : "error", "HTTP %d".formatted(status),
                status < 400 ? "目标站点返回了可用响应。" : "目标站点返回错误状态，请检查响应头和目标服务。"));
        if (inputFragmentRemoved) {
            findings.add(new Finding("info", "已忽略 URL 片段", "# 后的内容只用于浏览器页面定位，不会随 HTTP 请求发送给服务器。"));
        }
        if (trustedPrivateTarget) {
            findings.add(new Finding("info", "受信任私网目标", "目标由服务器配置的受信任域名规则放行，仍执行端口限制、DNS 固定与逐跳校验。"));
        }
        if (redirectCount > 0) {
            findings.add(new Finding("info", "%d 次重定向".formatted(redirectCount), "已逐跳验证并跟随目标地址。"));
        }
        findings.add(new Finding(compression.compressed() ? "success" : "warning", "内容压缩", compression.summary()));
        findings.add(new Finding(cache.freshnessSeconds() != null ? "success" : "info", "缓存策略", cache.summary()));
        findings.add(new Finding(security.score() >= 75 ? "success" : security.score() >= 50 ? "warning" : "error",
                "安全响应头 %s · %d 分".formatted(security.grade(), security.score()), security.summary()));
        if (security.weakCookieCount() > 0) {
            findings.add(new Finding("warning", "Cookie 属性需要复核",
                    "%d 个 Set-Cookie 中有 %d 个未同时声明推荐的 Secure、HttpOnly、SameSite 属性。"
                            .formatted(security.cookieCount(), security.weakCookieCount())));
        }
        findings.add(new Finding(cors.configured() && !cors.permissive() ? "success" : "info", "CORS 策略", cors.summary()));
        if (!response.server().equals("未声明") || !response.poweredBy().equals("未声明")) {
            findings.add(new Finding("info", "服务端指纹", response.summary()));
        }
        if (authentication.configured()) {
            findings.add(new Finding(authentication.strippedOnRedirect() ? "warning" : "success", "凭证转发边界", authentication.summary()));
        }
        if (tls.used()) {
            var certificate = tls.handshakes().getLast();
            var level = certificate.daysRemaining() < 30 ? "warning" : "success";
            findings.add(new Finding(level, "TLS 证书 · %s".formatted(certificate.issuerOrganization()),
                    "%s / %s，握手 %d ms，证书剩余 %d 天。"
                            .formatted(certificate.protocol(), certificate.cipherSuite(), certificate.handshakeMs(), certificate.daysRemaining())));
        } else {
            findings.add(new Finding("warning", "未使用 TLS", "目标使用明文 HTTP，无法提供证书或 HTTPS 握手信息。"));
        }
    }

    private String firstHeader(List<HeaderEntry> headers, String name) {
        return headers.stream()
                .filter(header -> header.name().equalsIgnoreCase(name))
                .map(HeaderEntry::value)
                .findFirst()
                .orElse(null);
    }

    private List<String> allHeaders(List<HeaderEntry> headers, String name) {
        return headers.stream()
                .filter(header -> header.name().equalsIgnoreCase(name))
                .map(HeaderEntry::value)
                .toList();
    }

    private String valueOrMissing(String value) {
        return value == null || value.isBlank() ? "未声明" : value;
    }

    private Long parseLong(String value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private long elapsedMs(long started) {
        return Math.max(0, Math.round((System.nanoTime() - started) / 1_000_000.0));
    }

    private record ResponseSnapshot(
            int status,
            String reasonPhrase,
            String protocol,
            List<Header> headers,
            Optional<TlsHandshake> tlsHandshake
    ) {
        String firstHeader(String name) {
            return headers.stream()
                    .filter(header -> header.getName().equalsIgnoreCase(name))
                    .map(Header::getValue)
                    .findFirst()
                    .orElse(null);
        }
    }

    private record AuthenticationContext(String type, String username, String secret, String headerName) {
        static AuthenticationContext none() {
            return new AuthenticationContext("NONE", null, null, null);
        }

        boolean configured() {
            return !type.equals("NONE");
        }
    }

    private record RequestOrigin(String scheme, String host, int port) {
        static RequestOrigin from(URI uri) {
            var scheme = uri.getScheme().toLowerCase(Locale.ROOT);
            var port = uri.getPort() >= 0 ? uri.getPort() : scheme.equals("https") ? 443 : 80;
            return new RequestOrigin(scheme, uri.getHost().toLowerCase(Locale.ROOT), port);
        }
    }

    private static final class PinnedDnsResolver implements DnsResolver {
        private final String host;
        private final InetAddress[] addresses;

        private PinnedDnsResolver(String host, InetAddress[] addresses) {
            this.host = host;
            this.addresses = addresses.clone();
        }

        @Override
        public InetAddress[] resolve(String requestedHost) throws UnknownHostException {
            if (!host.equalsIgnoreCase(requestedHost)) {
                throw new UnknownHostException("Unvalidated host: " + requestedHost);
            }
            return addresses.clone();
        }

        @Override
        public String resolveCanonicalHostname(String requestedHost) throws UnknownHostException {
            if (!host.equalsIgnoreCase(requestedHost)) {
                throw new UnknownHostException("Unvalidated host: " + requestedHost);
            }
            return host;
        }
    }
}
