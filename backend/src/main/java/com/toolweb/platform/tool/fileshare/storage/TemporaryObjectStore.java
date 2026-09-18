package com.toolweb.platform.tool.fileshare.storage;

import org.springframework.core.io.Resource;
import org.springframework.core.io.InputStreamSource;

import java.io.IOException;
import java.time.Instant;
import java.util.List;

public interface TemporaryObjectStore {

    StoredObject store(InputStreamSource source, long expectedSize, String filename) throws IOException;

    Resource open(String objectPath) throws IOException;

    void delete(String objectPath) throws IOException;

    List<StoredObjectReference> findOlderThan(Instant cutoff, int limit) throws IOException;

    record StoredObject(String objectKey, String objectPath, long sizeBytes, String sha256) {
    }

    record StoredObjectReference(String objectKey, String objectPath) {
    }
}
