package com.toolweb.platform.tool.fileshare.service;

import com.toolweb.platform.tool.fileshare.config.TemporaryFileShareProperties;
import com.toolweb.platform.tool.fileshare.dao.TemporaryFileShareMapper;
import com.toolweb.platform.tool.fileshare.entity.TemporaryFileShare;
import com.toolweb.platform.tool.fileshare.exception.FileShareAccessException;
import com.toolweb.platform.tool.fileshare.exception.FileShareStorageException;
import com.toolweb.platform.tool.fileshare.storage.TemporaryObjectStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.Semaphore;

import static com.toolweb.platform.tool.fileshare.dto.TemporaryFileShareModels.CreatedShare;
import static com.toolweb.platform.tool.fileshare.dto.TemporaryFileShareModels.DownloadGrant;

@Service
public class TemporaryFileShareService {

    private static final int ACCESS_KEY_BYTES = 32;
    private static final int MAX_FILENAME_CODE_POINTS = 180;
    private static final String FALLBACK_FILENAME = "shared-file";

    private final TemporaryFileShareMapper mapper;
    private final TemporaryObjectStore objectStore;
    private final TemporaryFileShareProperties properties;
    private final SecureRandom secureRandom;
    private final Clock clock;
    private final Semaphore uploadCapacity;

    @Autowired
    public TemporaryFileShareService(
            TemporaryFileShareMapper mapper,
            TemporaryObjectStore objectStore,
            TemporaryFileShareProperties properties
    ) {
        this(mapper, objectStore, properties, new SecureRandom(), Clock.systemUTC());
    }

    TemporaryFileShareService(
            TemporaryFileShareMapper mapper,
            TemporaryObjectStore objectStore,
            TemporaryFileShareProperties properties,
            SecureRandom secureRandom,
            Clock clock
    ) {
        this.mapper = mapper;
        this.objectStore = objectStore;
        this.properties = properties;
        this.secureRandom = secureRandom;
        this.clock = clock;
        this.uploadCapacity = new Semaphore(properties.maxConcurrentUploads(), true);
    }

    public CreatedShare create(MultipartFile file) {
        validateFile(file);
        if (!uploadCapacity.tryAcquire()) {
            throw new FileShareStorageException(FileShareStorageException.Reason.CAPACITY_EXCEEDED);
        }
        TemporaryObjectStore.StoredObject stored = null;
        try {
            var originalFilename = sanitizeFilename(file.getOriginalFilename());
            stored = objectStore.store(file, file.getSize(), originalFilename);
            var now = clock.instant();
            var accessKey = newAccessKey();
            var entity = TemporaryFileShare.create(
                    UUID.randomUUID().toString(),
                    digestHex(accessKey),
                    stored.objectKey(),
                    stored.objectPath(),
                    originalFilename,
                    "application/octet-stream",
                    stored.sizeBytes(),
                    stored.sha256(),
                    now,
                    now.plus(properties.expiresAfter()),
                    properties.maxDownloads());
            if (mapper.insert(entity) != 1) {
                throw new IllegalStateException("Temporary file share insert affected no row");
            }
            return new CreatedShare(
                    entity.shareId(), accessKey, entity.originalFilename(), entity.sizeBytes(), entity.sha256(),
                    entity.expiresAt(), now, entity.maxDownloads());
        } catch (FileShareStorageException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new FileShareStorageException(FileShareStorageException.Reason.IO_FAILURE, exception);
        } catch (RuntimeException exception) {
            deleteAfterFailedCreate(stored, exception);
            throw exception;
        } finally {
            uploadCapacity.release();
        }
    }

    @Transactional
    public DownloadGrant authorizeDownload(String shareId, String accessKey) {
        var share = mapper.selectForUpdate(normalizeShareId(shareId))
                .orElseThrow(() -> new FileShareAccessException(FileShareAccessException.Reason.INVALID));
        if (!constantTimeEquals(share.accessKeyDigest(), digestHex(accessKey))) {
            throw new FileShareAccessException(FileShareAccessException.Reason.INVALID);
        }
        var now = clock.instant();
        if (!now.isBefore(share.expiresAt())) {
            throw new FileShareAccessException(FileShareAccessException.Reason.EXPIRED);
        }
        if (share.status() != TemporaryFileShare.Status.ACTIVE || share.downloadCount() >= share.maxDownloads()) {
            throw new FileShareAccessException(FileShareAccessException.Reason.CONSUMED);
        }
        try {
            var resource = objectStore.open(share.storagePath());
            share.consume(now);
            if (mapper.updateById(share) != 1) {
                throw new FileShareStorageException(FileShareStorageException.Reason.IO_FAILURE);
            }
            return new DownloadGrant(resource, share.originalFilename(), share.sizeBytes(), share.sha256());
        } catch (IOException exception) {
            throw new FileShareStorageException(FileShareStorageException.Reason.IO_FAILURE, exception);
        }
    }

    @Transactional
    public int cleanupExpired() {
        var now = clock.instant();
        var cutoff = now.minus(properties.cleanupGrace());
        var expired = mapper.selectExpiredActive(cutoff, properties.cleanupBatchSize());
        var deleted = 0;
        for (var share : expired) {
            try {
                objectStore.delete(share.storagePath());
                var version = share.version();
                share.markDeleted(now);
                deleted += mapper.markDeleted(share.shareId(), share.deletedAt(), version);
            } catch (IOException ignored) {
                // Retain metadata so a later cleanup pass can retry the object deletion.
            }
        }
        deleted += cleanupOrphanedObjects(now.minus(properties.expiresAfter()).minus(properties.cleanupGrace()));
        return deleted;
    }

    private int cleanupOrphanedObjects(Instant cutoff) {
        try {
            var deleted = 0;
            for (var object : objectStore.findOlderThan(cutoff, properties.cleanupBatchSize())) {
                if (!mapper.existsActiveByObjectKey(object.objectKey())) {
                    objectStore.delete(object.objectPath());
                    deleted++;
                }
            }
            return deleted;
        } catch (IOException ignored) {
            return 0;
        }
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() <= 0) {
            throw new FileShareStorageException(FileShareStorageException.Reason.FILE_TOO_LARGE);
        }
        if (file.getSize() > properties.maxFileSize().toBytes()) {
            throw new FileShareStorageException(FileShareStorageException.Reason.FILE_TOO_LARGE);
        }
    }

    private String newAccessKey() {
        var bytes = new byte[ACCESS_KEY_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String digestHex(String accessKey) {
        if (accessKey == null || accessKey.isBlank() || accessKey.length() > 128) {
            return "0".repeat(64);
        }
        try {
            var digest = MessageDigest.getInstance("SHA-256")
                    .digest(accessKey.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private boolean constantTimeEquals(String persistedDigest, String candidateDigest) {
        return MessageDigest.isEqual(
                persistedDigest.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                candidateDigest.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    }

    private String normalizeShareId(String shareId) {
        try {
            return UUID.fromString(shareId == null ? "" : shareId.strip()).toString();
        } catch (IllegalArgumentException exception) {
            throw new FileShareAccessException(FileShareAccessException.Reason.INVALID);
        }
    }

    private String sanitizeFilename(String candidate) {
        var normalized = candidate == null ? "" : candidate.replace('\\', '/');
        normalized = normalized.substring(normalized.lastIndexOf('/') + 1)
                .replaceAll("[\\p{Cc}\\p{Cf}]", "")
                .strip();
        if (normalized.isEmpty() || normalized.equals(".") || normalized.equals("..")) {
            return FALLBACK_FILENAME;
        }
        var count = normalized.codePointCount(0, normalized.length());
        if (count > MAX_FILENAME_CODE_POINTS) {
            normalized = normalized.substring(0, normalized.offsetByCodePoints(0, MAX_FILENAME_CODE_POINTS));
        }
        return normalized;
    }

    private void deleteAfterFailedCreate(TemporaryObjectStore.StoredObject stored, RuntimeException original) {
        if (stored == null) {
            return;
        }
        try {
            objectStore.delete(stored.objectPath());
        } catch (IOException cleanupFailure) {
            original.addSuppressed(cleanupFailure);
        }
    }
}
