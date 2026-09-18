package com.toolweb.platform.tool.fileshare.storage;

import com.toolweb.platform.tool.fileshare.config.TemporaryFileShareProperties;
import com.toolweb.platform.tool.fileshare.exception.FileShareStorageException;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.InputStreamSource;
import org.springframework.core.io.Resource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

@Component
@ConditionalOnProperty(
        prefix = "tool-platform.temporary-file-share",
        name = "storage-provider",
        havingValue = "filesystem",
        matchIfMissing = true)
public class FileSystemTemporaryObjectStore implements TemporaryObjectStore {

    private static final int BUFFER_SIZE = 64 * 1024;

    private final Path root;
    private final long maxFileSize;
    private final long maxStoredBytes;
    private final AtomicLong allocatedBytes;

    public FileSystemTemporaryObjectStore(TemporaryFileShareProperties properties) {
        root = Path.of(properties.storageRoot()).toAbsolutePath().normalize();
        maxFileSize = properties.maxFileSize().toBytes();
        maxStoredBytes = properties.maxStoredBytes().toBytes();
        try {
            Files.createDirectories(root);
            removeAbandonedStagingFiles();
            try (var files = Files.list(root)) {
                allocatedBytes = new AtomicLong(files
                        .filter(Files::isRegularFile)
                        .mapToLong(this::sizeWithoutFailure)
                        .sum());
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to initialize temporary file storage", exception);
        }
    }

    @Override
    public StoredObject store(InputStreamSource source, long expectedSize, String filename) throws IOException {
        if (expectedSize <= 0 || expectedSize > maxFileSize) {
            throw new FileShareStorageException(FileShareStorageException.Reason.FILE_TOO_LARGE);
        }
        reserve(expectedSize);
        var objectKey = UUID.randomUUID().toString();
        var target = resolve(objectKey);
        var staging = resolve(objectKey + ".part");
        var actualSize = 0L;
        var completed = false;
        try {
            var digest = sha256();
            try (var input = source.getInputStream(); var output = Files.newOutputStream(staging)) {
                var buffer = new byte[BUFFER_SIZE];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    actualSize += read;
                    if (actualSize > maxFileSize || actualSize > expectedSize) {
                        throw new FileShareStorageException(FileShareStorageException.Reason.FILE_TOO_LARGE);
                    }
                    digest.update(buffer, 0, read);
                    output.write(buffer, 0, read);
                }
            }
            moveIntoPlace(staging, target);
            completed = true;
            allocatedBytes.addAndGet(actualSize - expectedSize);
            return new StoredObject(objectKey, objectKey, actualSize, HexFormat.of().formatHex(digest.digest()));
        } finally {
            if (!completed) {
                Files.deleteIfExists(staging);
                allocatedBytes.addAndGet(-expectedSize);
            }
        }
    }

    @Override
    public Resource open(String objectKey) throws IOException {
        var path = resolve(objectKey);
        if (!Files.isRegularFile(path)) {
            throw new FileShareStorageException(FileShareStorageException.Reason.OBJECT_MISSING);
        }
        return new FileSystemResource(path);
    }

    @Override
    public void delete(String objectKey) throws IOException {
        var path = resolve(objectKey);
        var size = Files.isRegularFile(path) ? Files.size(path) : 0L;
        if (Files.deleteIfExists(path)) {
            allocatedBytes.updateAndGet(current -> Math.max(0, current - size));
        }
    }

    @Override
    public List<StoredObjectReference> findOlderThan(Instant cutoff, int limit) throws IOException {
        try (var files = Files.list(root)) {
            return files
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().matches("[0-9a-f-]{36}"))
                    .filter(path -> lastModifiedWithoutFailure(path).isBefore(cutoff))
                    .sorted(Comparator.comparing(this::lastModifiedWithoutFailure))
                    .limit(Math.max(0, limit))
                    .map(path -> new StoredObjectReference(
                            path.getFileName().toString(), path.getFileName().toString()))
                    .toList();
        }
    }

    private void reserve(long size) {
        while (true) {
            var current = allocatedBytes.get();
            if (current > maxStoredBytes - size) {
                throw new FileShareStorageException(FileShareStorageException.Reason.CAPACITY_EXCEEDED);
            }
            if (allocatedBytes.compareAndSet(current, current + size)) {
                return;
            }
        }
    }

    private Path resolve(String objectKey) {
        if (!objectKey.matches("[0-9a-f-]{36}(?:\\.part)?")) {
            throw new IllegalArgumentException("Invalid object key");
        }
        var path = root.resolve(objectKey).normalize();
        if (!path.getParent().equals(root)) {
            throw new IllegalArgumentException("Object key escaped storage root");
        }
        return path;
    }

    private void moveIntoPlace(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(source, target);
        }
    }

    private MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private long sizeWithoutFailure(Path path) {
        try {
            return Files.size(path);
        } catch (IOException ignored) {
            return 0L;
        }
    }

    private Instant lastModifiedWithoutFailure(Path path) {
        try {
            return Files.getLastModifiedTime(path).toInstant();
        } catch (IOException ignored) {
            return Instant.MAX;
        }
    }

    private void removeAbandonedStagingFiles() throws IOException {
        try (var files = Files.list(root)) {
            for (var staging : files
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().matches("[0-9a-f-]{36}\\.part"))
                    .toList()) {
                Files.deleteIfExists(staging);
            }
        }
    }
}
