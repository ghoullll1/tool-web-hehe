package com.toolweb.platform.tool.document.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

import java.net.URI;
import java.time.Duration;

@ConfigurationProperties("tool-platform.document-conversion")
public record DocumentConversionProperties(
        URI workerBaseUrl,
        String workerToken,
        DataSize maxFileSize,
        DataSize maxResponseSize,
        Duration connectTimeout,
        Duration responseTimeout,
        int maxConcurrentConversions
) {
    public static final DataSize HARD_MAX_FILE_SIZE = DataSize.ofMegabytes(10);
    private static final DataSize DEFAULT_MAX_RESPONSE_SIZE = DataSize.ofMegabytes(68);
    private static final DataSize HARD_MAX_RESPONSE_SIZE = DataSize.ofMegabytes(80);

    public DocumentConversionProperties {
        workerBaseUrl = workerBaseUrl == null ? URI.create("http://127.0.0.1:8091") : workerBaseUrl;
        if (!isHttpUrl(workerBaseUrl)) {
            throw new IllegalArgumentException("Document conversion worker URL must be an absolute HTTP(S) URL without credentials");
        }
        workerToken = workerToken == null ? "" : workerToken.strip();
        maxFileSize = maxFileSize == null ? HARD_MAX_FILE_SIZE : maxFileSize;
        if (maxFileSize.toBytes() <= 0 || maxFileSize.compareTo(HARD_MAX_FILE_SIZE) > 0) {
            throw new IllegalArgumentException("Document conversion file limit must be between 1 byte and 10 MB");
        }
        maxResponseSize = maxResponseSize == null ? DEFAULT_MAX_RESPONSE_SIZE : maxResponseSize;
        if (maxResponseSize.toBytes() <= 0 || maxResponseSize.compareTo(HARD_MAX_RESPONSE_SIZE) > 0) {
            throw new IllegalArgumentException("Document conversion response limit must be between 1 byte and 80 MB");
        }
        connectTimeout = positiveOrDefault(connectTimeout, Duration.ofSeconds(3));
        responseTimeout = positiveOrDefault(responseTimeout, Duration.ofSeconds(130));
        maxConcurrentConversions = maxConcurrentConversions <= 0 ? 4 : Math.min(maxConcurrentConversions, 16);
    }

    public URI conversionEndpoint() {
        var base = workerBaseUrl.toString();
        return URI.create((base.endsWith("/") ? base.substring(0, base.length() - 1) : base)
                + "/internal/v1/conversions");
    }

    private static boolean isHttpUrl(URI value) {
        var scheme = value.getScheme();
        return value.isAbsolute()
                && ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                && value.getHost() != null
                && value.getUserInfo() == null
                && value.getFragment() == null
                && value.getQuery() == null;
    }

    private static Duration positiveOrDefault(Duration value, Duration fallback) {
        return value == null || value.isZero() || value.isNegative() ? fallback : value;
    }
}
