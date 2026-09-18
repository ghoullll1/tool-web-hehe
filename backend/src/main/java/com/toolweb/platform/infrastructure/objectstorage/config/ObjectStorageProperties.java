package com.toolweb.platform.infrastructure.objectstorage.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
import java.time.Duration;

@ConfigurationProperties("tool-platform.object-storage")
public record ObjectStorageProperties(
        URI endpoint,
        String region,
        String bucket,
        String basePrefix,
        String accessKey,
        String secretKey,
        boolean pathStyleAccess,
        Duration connectTimeout,
        Duration socketTimeout,
        Duration apiCallTimeout,
        Duration connectionAcquireTimeout,
        int maxConnections
) {
    private static final URI DEFAULT_ENDPOINT = URI.create("http://127.0.0.1:9000");

    public ObjectStorageProperties {
        endpoint = endpoint == null ? DEFAULT_ENDPOINT : endpoint;
        region = textOrDefault(region, "us-east-1");
        bucket = textOrDefault(bucket, "temp-files");
        basePrefix = normalizePrefix(basePrefix);
        accessKey = accessKey == null ? "" : accessKey.strip();
        secretKey = secretKey == null ? "" : secretKey.strip();
        connectTimeout = positiveOrDefault(connectTimeout, Duration.ofSeconds(3));
        socketTimeout = positiveOrDefault(socketTimeout, Duration.ofSeconds(30));
        apiCallTimeout = positiveOrDefault(apiCallTimeout, Duration.ofSeconds(40));
        connectionAcquireTimeout = positiveOrDefault(connectionAcquireTimeout, Duration.ofSeconds(5));
        maxConnections = maxConnections <= 0 ? 32 : Math.min(maxConnections, 256);
    }

    public void validateForS3() {
        if (endpoint.getScheme() == null
                || !(endpoint.getScheme().equalsIgnoreCase("http") || endpoint.getScheme().equalsIgnoreCase("https"))
                || endpoint.getHost() == null
                || (endpoint.getPath() != null && !endpoint.getPath().isBlank() && !endpoint.getPath().equals("/"))
                || endpoint.getQuery() != null
                || endpoint.getFragment() != null) {
            throw new IllegalStateException("Object storage endpoint must be an HTTP(S) origin");
        }
        if (basePrefix.length() > 900
                || basePrefix.contains("//")
                || basePrefix.equals("../")
                || basePrefix.startsWith("../")
                || basePrefix.contains("/../")) {
            throw new IllegalStateException("Object storage base prefix is invalid");
        }
        if (accessKey.isBlank() || secretKey.isBlank()) {
            throw new IllegalStateException("Object storage access key and secret key are required in RustFS mode");
        }
    }

    private static String normalizePrefix(String value) {
        if (value == null || value.isBlank()) {
            return "tool-web/";
        }
        var normalized = value.strip().replace('\\', '/');
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        return normalized.endsWith("/") ? normalized : normalized + "/";
    }

    private static String textOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.strip();
    }

    private static Duration positiveOrDefault(Duration value, Duration fallback) {
        return value == null || value.isZero() || value.isNegative() ? fallback : value;
    }
}
