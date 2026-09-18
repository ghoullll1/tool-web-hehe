package com.toolweb.platform.tool.fileshare.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

import java.time.Duration;

@ConfigurationProperties("tool-platform.temporary-file-share")
public record TemporaryFileShareProperties(
        String storageRoot,
        DataSize maxFileSize,
        DataSize maxStoredBytes,
        Duration expiresAfter,
        int maxDownloads,
        int maxConcurrentUploads,
        Duration cleanupInterval,
        Duration cleanupGrace,
        int cleanupBatchSize,
        StorageProvider storageProvider
) {
    public enum StorageProvider {
        FILESYSTEM,
        RUSTFS
    }

    private static final DataSize DEFAULT_MAX_FILE_SIZE = DataSize.ofMegabytes(30);
    private static final DataSize DEFAULT_MAX_STORED_BYTES = DataSize.ofGigabytes(1);
    private static final Duration FIXED_EXPIRY = Duration.ofMinutes(5);
    private static final int FIXED_MAX_DOWNLOADS = 1;

    public TemporaryFileShareProperties {
        storageRoot = storageRoot == null || storageRoot.isBlank()
                ? "./data/temporary-file-shares"
                : storageRoot.strip();
        maxFileSize = positiveOrDefault(maxFileSize, DEFAULT_MAX_FILE_SIZE);
        maxStoredBytes = positiveOrDefault(maxStoredBytes, DEFAULT_MAX_STORED_BYTES);
        if (maxStoredBytes.compareTo(maxFileSize) < 0) {
            throw new IllegalArgumentException("Temporary share storage quota must be at least the maximum file size");
        }
        if (expiresAfter != null && !expiresAfter.equals(FIXED_EXPIRY)) {
            throw new IllegalArgumentException("Temporary shares have a fixed five-minute lifetime");
        }
        if (maxDownloads > 0 && maxDownloads != FIXED_MAX_DOWNLOADS) {
            throw new IllegalArgumentException("Temporary shares allow exactly one download");
        }
        expiresAfter = FIXED_EXPIRY;
        maxDownloads = FIXED_MAX_DOWNLOADS;
        maxConcurrentUploads = maxConcurrentUploads <= 0 ? 8 : Math.min(maxConcurrentUploads, 64);
        cleanupInterval = positiveOrDefault(cleanupInterval, Duration.ofSeconds(30));
        cleanupGrace = nonNegativeOrDefault(cleanupGrace, Duration.ofMinutes(2));
        cleanupBatchSize = cleanupBatchSize <= 0 ? 100 : Math.min(cleanupBatchSize, 1_000);
        storageProvider = storageProvider == null ? StorageProvider.FILESYSTEM : storageProvider;
    }

    private static DataSize positiveOrDefault(DataSize value, DataSize fallback) {
        return value == null || value.toBytes() <= 0 ? fallback : value;
    }

    private static Duration positiveOrDefault(Duration value, Duration fallback) {
        return value == null || value.isZero() || value.isNegative() ? fallback : value;
    }

    private static Duration nonNegativeOrDefault(Duration value, Duration fallback) {
        return value == null || value.isNegative() ? fallback : value;
    }
}
