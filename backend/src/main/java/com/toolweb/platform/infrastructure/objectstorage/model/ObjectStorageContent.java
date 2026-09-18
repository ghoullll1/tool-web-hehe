package com.toolweb.platform.infrastructure.objectstorage.model;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;

public record ObjectStorageContent(
        InputStream inputStream,
        long contentLength,
        String contentType,
        Instant lastModified
) implements AutoCloseable {

    @Override
    public void close() throws IOException {
        inputStream.close();
    }
}
