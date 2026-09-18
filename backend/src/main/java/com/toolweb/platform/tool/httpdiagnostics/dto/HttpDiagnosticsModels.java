package com.toolweb.platform.tool.httpdiagnostics.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class HttpDiagnosticsModels {

    private HttpDiagnosticsModels() {
    }

    public record Request(
            @NotBlank @Size(max = 2048) String url,
            @Pattern(regexp = "(?i)GET|HEAD", message = "仅支持 GET 或 HEAD") String method,
            Boolean followRedirects,
            @Min(0) @Max(10) Integer maxRedirects,
            @Min(1000) @Max(20000) Integer timeoutMs,
            @Size(max = 160) String acceptLanguage,
            @Size(max = 240) String userAgent,
            @Valid Authentication authentication
    ) {
    }

    public record Authentication(
            @Pattern(regexp = "(?i)NONE|BASIC|BEARER|API_KEY", message = "认证方式不受支持") String type,
            @Size(max = 160) String username,
            @Size(max = 512) String secret,
            @Pattern(regexp = "[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}", message = "API Key 请求头名称不合法") String headerName
    ) {
    }

    public record Result(
            String requestedUrl,
            String finalUrl,
            String method,
            int status,
            String reasonPhrase,
            String protocol,
            List<String> resolvedAddresses,
            List<RedirectHop> redirects,
            List<HeaderEntry> headers,
            CompressionAnalysis compression,
            CacheAnalysis cache,
            SecurityAnalysis security,
            CorsAnalysis cors,
            ResponseProfile response,
            AuthenticationAnalysis authentication,
            TlsAnalysis tls,
            TimingAnalysis timing,
            List<Finding> findings,
            Instant inspectedAt,
            String requestId
    ) {
    }

    public record RedirectHop(
            int sequence,
            String url,
            int status,
            String location,
            String resolvedUrl,
            long durationMs
    ) {
    }

    public record HeaderEntry(String name, String value) {
    }

    public record CompressionAnalysis(
            boolean compressed,
            String contentEncoding,
            String contentType,
            Long contentLength,
            boolean variesByAcceptEncoding,
            String summary
    ) {
    }

    public record CacheAnalysis(
            String cacheControl,
            boolean browserCacheable,
            boolean sharedCacheable,
            Long freshnessSeconds,
            boolean hasValidator,
            String validator,
            String summary
    ) {
    }

    public record TimingAnalysis(
            long dnsMs,
            long connectionAndHeadersMs,
            long totalMs,
            int redirectCount,
            String note
    ) {
    }

    public record SecurityAnalysis(
            int score,
            String grade,
            boolean heuristic,
            List<ControlAssessment> controls,
            int cookieCount,
            int weakCookieCount,
            String summary
    ) {
    }

    public record ControlAssessment(String name, String status, String detail) {
    }

    public record CorsAnalysis(
            boolean configured,
            String allowOrigin,
            boolean allowsCredentials,
            String allowMethods,
            String allowHeaders,
            String exposeHeaders,
            boolean permissive,
            String summary
    ) {
    }

    public record ResponseProfile(
            String contentType,
            String charset,
            String transferEncoding,
            String connection,
            String server,
            String poweredBy,
            String contentDisposition,
            Long ageSeconds,
            int cookieCount,
            String summary
    ) {
    }

    public record AuthenticationAnalysis(
            boolean configured,
            String type,
            boolean sentToFinalOrigin,
            boolean strippedOnRedirect,
            String summary
    ) {
    }

    public record TlsAnalysis(
            boolean used,
            int handshakeCount,
            long totalHandshakeMs,
            List<TlsHandshake> handshakes,
            String summary
    ) {
    }

    public record TlsHandshake(
            int sequence,
            String url,
            String host,
            long handshakeMs,
            String protocol,
            String cipherSuite,
            String issuerOrganization,
            String issuerDistinguishedName,
            String subjectCommonName,
            String subjectDistinguishedName,
            Instant validFrom,
            Instant validUntil,
            long daysRemaining,
            String serialNumber,
            String signatureAlgorithm,
            int certificateChainLength
    ) {
    }

    public record Finding(String level, String title, String detail) {
    }
}
