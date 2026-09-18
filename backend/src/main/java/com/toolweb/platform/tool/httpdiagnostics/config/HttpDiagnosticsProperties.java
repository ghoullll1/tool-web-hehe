package com.toolweb.platform.tool.httpdiagnostics.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Locale;
import java.util.Set;

@ConfigurationProperties("tool-platform.http-diagnostics")
public record HttpDiagnosticsProperties(
        Duration connectTimeout,
        Duration responseTimeout,
        int maxRedirects,
        int maxResponseHeaders,
        int maxHeaderValueLength,
        int maxConcurrentRequests,
        boolean allowPrivateTargets,
        Set<String> trustedPrivateHosts,
        Set<Integer> allowedPorts
) {
    public HttpDiagnosticsProperties {
        connectTimeout = connectTimeout == null ? Duration.ofSeconds(4) : connectTimeout;
        responseTimeout = responseTimeout == null ? Duration.ofSeconds(12) : responseTimeout;
        maxRedirects = maxRedirects <= 0 ? 6 : Math.min(maxRedirects, 10);
        maxResponseHeaders = maxResponseHeaders <= 0 ? 128 : Math.min(maxResponseHeaders, 256);
        maxHeaderValueLength = maxHeaderValueLength <= 0 ? 4096 : Math.min(maxHeaderValueLength, 16384);
        maxConcurrentRequests = maxConcurrentRequests <= 0 ? 16 : Math.min(maxConcurrentRequests, 128);
        trustedPrivateHosts = trustedPrivateHosts == null ? Set.of() : Set.copyOf(trustedPrivateHosts.stream()
                .map(String::strip)
                .filter(value -> !value.isEmpty())
                .map(value -> value.toLowerCase(Locale.ROOT))
                .toList());
        allowedPorts = allowedPorts == null || allowedPorts.isEmpty() ? Set.of(80, 443) : Set.copyOf(allowedPorts);
    }
}
