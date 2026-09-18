package com.toolweb.platform.tool.fileshare.storage;

import com.toolweb.platform.infrastructure.objectstorage.exception.ObjectStorageException;
import com.toolweb.platform.infrastructure.objectstorage.service.ObjectStorageService;
import com.toolweb.platform.tool.fileshare.config.TemporaryFileShareProperties;
import com.toolweb.platform.tool.fileshare.exception.FileShareStorageException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.InputStreamSource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Component
@ConditionalOnProperty(
        prefix = "tool-platform.temporary-file-share",
        name = "storage-provider",
        havingValue = "rustfs")
public class RustFsTemporaryObjectStore implements TemporaryObjectStore {

    private static final String OBJECT_PREFIX = "temporary-file-shares/";
    private static final int BUFFER_SIZE = 64 * 1024;

    private final ObjectStorageService objectStorage;
    private final long maxFileSize;

    public RustFsTemporaryObjectStore(
            ObjectStorageService objectStorage,
            TemporaryFileShareProperties properties
    ) {
        this.objectStorage = objectStorage;
        this.maxFileSize = properties.maxFileSize().toBytes();
    }

    @Override
    public StoredObject store(InputStreamSource source, long expectedSize, String filename) throws IOException {
        if (source == null || expectedSize <= 0 || expectedSize > maxFileSize
                || filename == null || filename.isBlank() || filename.contains("/") || filename.contains("\\")) {
            throw new FileShareStorageException(FileShareStorageException.Reason.FILE_TOO_LARGE);
        }
        var fingerprint = fingerprint(source, expectedSize);
        var objectKey = UUID.randomUUID().toString();
        try {
            var objectPath = objectStorage.resolveObjectPath(storageKey(objectKey, filename));
            objectStorage.putObject(
                    objectPath,
                    source,
                    fingerprint.sizeBytes(),
                    "application/octet-stream");
            return new StoredObject(objectKey, objectPath, fingerprint.sizeBytes(), fingerprint.sha256());
        } catch (ObjectStorageException exception) {
            throw map(exception);
        }
    }

    @Override
    public Resource open(String objectPath) {
        final String normalizedPath;
        final long contentLength;
        try {
            normalizedPath = requireObjectPath(objectPath);
            contentLength = objectStorage.headObject(normalizedPath).contentLength();
        } catch (ObjectStorageException exception) {
            throw map(exception);
        }
        return new AbstractResource() {
            @Override
            public String getDescription() {
                return "RustFS temporary object " + normalizedPath;
            }

            @Override
            public long contentLength() {
                return contentLength;
            }

            @Override
            public InputStream getInputStream() throws IOException {
                try {
                    return objectStorage.getObject(normalizedPath).inputStream();
                } catch (ObjectStorageException exception) {
                    throw new IOException("Unable to open temporary object", map(exception));
                }
            }
        };
    }

    @Override
    public void delete(String objectPath) {
        try {
            objectStorage.deleteObject(requireObjectPath(objectPath));
        } catch (ObjectStorageException exception) {
            throw map(exception);
        }
    }

    @Override
    public List<StoredObjectReference> findOlderThan(Instant cutoff, int limit) {
        try {
            var objectPrefix = objectStorage.resolveObjectPath(OBJECT_PREFIX);
            return objectStorage.listObjectsModifiedBefore(objectPrefix, cutoff, limit).stream()
                    .map(metadata -> metadata.key())
                    .filter(path -> path.startsWith(objectPrefix))
                    .map(path -> reference(path, objectPrefix))
                    .filter(java.util.Objects::nonNull)
                    .toList();
        } catch (ObjectStorageException exception) {
            throw map(exception);
        }
    }

    private Fingerprint fingerprint(InputStreamSource source, long expectedSize) throws IOException {
        var digest = sha256();
        var actualSize = 0L;
        try (var input = source.getInputStream()) {
            var buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) {
                actualSize += read;
                if (actualSize > expectedSize || actualSize > maxFileSize) {
                    throw new FileShareStorageException(FileShareStorageException.Reason.FILE_TOO_LARGE);
                }
                digest.update(buffer, 0, read);
            }
        }
        if (actualSize <= 0) {
            throw new FileShareStorageException(FileShareStorageException.Reason.FILE_TOO_LARGE);
        }
        return new Fingerprint(actualSize, HexFormat.of().formatHex(digest.digest()));
    }

    private String requireObjectPath(String objectPath) {
        if (isObjectKey(objectPath)) {
            return objectStorage.resolveObjectPath(storageKey(objectPath));
        }
        var prefix = objectStorage.resolveObjectPath(OBJECT_PREFIX);
        if (reference(objectPath, prefix) == null) {
            throw new IllegalArgumentException("Invalid object path");
        }
        return objectPath;
    }

    private boolean isObjectKey(String objectKey) {
        if (objectKey == null) {
            return false;
        }
        try {
            return UUID.fromString(objectKey).toString().equals(objectKey);
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private String storageKey(String objectKey) {
        return OBJECT_PREFIX + objectKey;
    }

    private String storageKey(String objectKey, String filename) {
        return storageKey(objectKey) + "/" + filename;
    }

    private StoredObjectReference reference(String objectPath, String objectPrefix) {
        if (objectPath == null || objectPrefix == null || !objectPath.startsWith(objectPrefix)) {
            return null;
        }
        var relative = objectPath.substring(objectPrefix.length());
        var separator = relative.indexOf('/');
        var objectKey = separator < 0 ? relative : relative.substring(0, separator);
        var filename = separator < 0 ? "" : relative.substring(separator + 1);
        if (!isObjectKey(objectKey)
                || (separator >= 0 && (filename.isBlank() || filename.contains("/")))) {
            return null;
        }
        return new StoredObjectReference(objectKey, objectPath);
    }

    private MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private FileShareStorageException map(ObjectStorageException exception) {
        var reason = exception.reason() == ObjectStorageException.Reason.NOT_FOUND
                ? FileShareStorageException.Reason.OBJECT_MISSING
                : FileShareStorageException.Reason.IO_FAILURE;
        return new FileShareStorageException(reason, exception);
    }

    private record Fingerprint(long sizeBytes, String sha256) {
    }
}
