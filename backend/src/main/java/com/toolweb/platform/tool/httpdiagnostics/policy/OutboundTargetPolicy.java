package com.toolweb.platform.tool.httpdiagnostics.policy;

import com.toolweb.platform.tool.execution.exception.ToolPolicyException;
import com.toolweb.platform.tool.httpdiagnostics.config.HttpDiagnosticsProperties;
import org.springframework.stereotype.Component;

import java.net.IDN;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Locale;

@Component
public class OutboundTargetPolicy {

    private final HttpDiagnosticsProperties properties;

    public OutboundTargetPolicy(HttpDiagnosticsProperties properties) {
        this.properties = properties;
    }

    public ValidatedTarget validate(String rawUrl) {
        final URI parsed;
        try {
            parsed = new URI(rawUrl.strip());
        } catch (URISyntaxException | NullPointerException exception) {
            throw new ToolPolicyException("URL 格式无效");
        }

        var scheme = parsed.getScheme() == null ? "" : parsed.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new ToolPolicyException("仅允许访问 HTTP 或 HTTPS 地址");
        }
        if (parsed.getRawUserInfo() != null) {
            throw new ToolPolicyException("URL 中不能内嵌用户凭证，请使用高级设置中的凭证区域");
        }
        if (parsed.getHost() == null || parsed.getHost().isBlank()) {
            throw new ToolPolicyException("URL 必须包含有效主机名");
        }

        var port = parsed.getPort() < 0 ? (scheme.equals("https") ? 443 : 80) : parsed.getPort();
        if (!properties.allowedPorts().contains(port)) {
            throw new ToolPolicyException("目标端口不在允许范围内");
        }

        final String asciiHost;
        try {
            asciiHost = parsed.getHost().contains(":")
                    ? parsed.getHost().toLowerCase(Locale.ROOT)
                    : IDN.toASCII(parsed.getHost(), IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException exception) {
            throw new ToolPolicyException("主机名格式无效");
        }

        final InetAddress[] addresses;
        var dnsStarted = System.nanoTime();
        try {
            addresses = InetAddress.getAllByName(asciiHost);
        } catch (UnknownHostException exception) {
            throw new ToolPolicyException("无法解析目标主机");
        }
        var dnsMs = elapsedMs(dnsStarted);
        var hasProtectedAddress = addresses.length == 0 || Arrays.stream(addresses).anyMatch(this::isDenied);
        var trustedPrivateHost = hasProtectedAddress && isTrustedPrivateHost(asciiHost);
        if (hasProtectedAddress && !properties.allowPrivateTargets() && !trustedPrivateHost) {
            throw new ToolPolicyException("目标解析到未受信任的内网或保留地址，已阻止请求；如属自有服务，请将域名加入服务器配置");
        }

        try {
            var authorityHost = asciiHost.contains(":") ? "[" + asciiHost + "]" : asciiHost;
            var authority = authorityHost + (parsed.getPort() < 0 ? "" : ":" + parsed.getPort());
            var path = parsed.getRawPath() == null || parsed.getRawPath().isEmpty() ? "/" : parsed.getRawPath();
            var query = parsed.getRawQuery() == null ? "" : "?" + parsed.getRawQuery();
            var normalized = new URI(scheme + "://" + authority + path + query);
            return new ValidatedTarget(
                    normalized,
                    addresses.clone(),
                    dnsMs,
                    parsed.getRawFragment() != null,
                    trustedPrivateHost && !properties.allowPrivateTargets());
        } catch (URISyntaxException exception) {
            throw new ToolPolicyException("URL 规范化失败");
        }
    }

    boolean isTrustedPrivateHost(String host) {
        var normalizedHost = host.toLowerCase(Locale.ROOT).replaceFirst("\\.$", "");
        return properties.trustedPrivateHosts().stream().anyMatch(pattern -> {
            var normalizedPattern = pattern.replaceFirst("\\.$", "");
            if (normalizedPattern.startsWith("*.") && normalizedPattern.length() > 2) {
                var suffix = normalizedPattern.substring(1);
                return normalizedHost.endsWith(suffix) && normalizedHost.length() > suffix.length();
            }
            return normalizedHost.equals(normalizedPattern);
        });
    }

    private boolean isDenied(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) {
            return true;
        }
        if (address instanceof Inet4Address) {
            return isDeniedIpv4(address.getAddress());
        }
        if (address instanceof Inet6Address) {
            var bytes = address.getAddress();
            if (isIpv4Mapped(bytes)) {
                return isDeniedIpv4(Arrays.copyOfRange(bytes, 12, 16));
            }
            return (bytes[0] & 0xfe) == 0xfc
                    || (bytes[0] & 0xff) == 0x20 && (bytes[1] & 0xff) == 0x01
                    && (bytes[2] & 0xff) == 0x0d && (bytes[3] & 0xff) == 0xb8;
        }
        return true;
    }

    private boolean isDeniedIpv4(byte[] bytes) {
        var a = bytes[0] & 0xff;
        var b = bytes[1] & 0xff;
        var c = bytes[2] & 0xff;
        return a == 0 || a == 10 || a == 127 || a >= 224
                || a == 100 && b >= 64 && b <= 127
                || a == 169 && b == 254
                || a == 172 && b >= 16 && b <= 31
                || a == 192 && b == 168
                || a == 192 && b == 0 && c <= 2
                || a == 198 && (b == 18 || b == 19)
                || a == 198 && b == 51 && c == 100
                || a == 203 && b == 0 && c == 113;
    }

    private boolean isIpv4Mapped(byte[] bytes) {
        if (bytes.length != 16 || bytes[10] != (byte) 0xff || bytes[11] != (byte) 0xff) {
            return false;
        }
        for (var index = 0; index < 10; index++) {
            if (bytes[index] != 0) {
                return false;
            }
        }
        return true;
    }

    private long elapsedMs(long started) {
        return Math.max(0, Math.round((System.nanoTime() - started) / 1_000_000.0));
    }

    public record ValidatedTarget(
            URI uri,
            InetAddress[] addresses,
            long dnsMs,
            boolean fragmentRemoved,
            boolean trustedPrivateTarget
    ) {
    }
}
