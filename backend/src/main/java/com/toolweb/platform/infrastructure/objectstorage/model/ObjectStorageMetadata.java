package com.toolweb.platform.infrastructure.objectstorage.model;

import java.time.Instant;

public record ObjectStorageMetadata(
        String key,
        long contentLength,
        String contentType,
        Instant lastModified
) {
}
