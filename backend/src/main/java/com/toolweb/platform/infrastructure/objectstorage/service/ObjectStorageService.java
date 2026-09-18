package com.toolweb.platform.infrastructure.objectstorage.service;

import com.toolweb.platform.infrastructure.objectstorage.model.ObjectStorageContent;
import com.toolweb.platform.infrastructure.objectstorage.model.ObjectStorageMetadata;
import org.springframework.core.io.InputStreamSource;

import java.time.Instant;
import java.util.List;

public interface ObjectStorageService {

    /**
     * Resolves a path relative to the configured application prefix into the
     * bucket-relative object path used by S3/RustFS. The returned value never
     * contains the endpoint or bucket name.
     */
    String resolveObjectPath(String relativePath);

    void putObject(String objectPath, InputStreamSource source, long contentLength, String contentType);

    ObjectStorageMetadata headObject(String objectPath);

    ObjectStorageContent getObject(String objectPath);

    void deleteObject(String objectPath);

    List<ObjectStorageMetadata> listObjectsModifiedBefore(String objectPathPrefix, Instant cutoff, int limit);
}
