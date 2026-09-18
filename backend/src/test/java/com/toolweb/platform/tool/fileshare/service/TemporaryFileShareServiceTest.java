package com.toolweb.platform.tool.fileshare.service;

import com.toolweb.platform.tool.fileshare.config.TemporaryFileShareProperties;
import com.toolweb.platform.tool.fileshare.dao.TemporaryFileShareMapper;
import com.toolweb.platform.tool.fileshare.entity.TemporaryFileShare;
import com.toolweb.platform.tool.fileshare.exception.FileShareAccessException;
import com.toolweb.platform.tool.fileshare.storage.TemporaryObjectStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;

import java.io.ByteArrayInputStream;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TemporaryFileShareServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-14T08:00:00Z");

    private TemporaryFileShareMapper mapper;
    private TemporaryObjectStore objectStore;
    private TemporaryFileShareService service;

    @BeforeEach
    void setUp() {
        mapper = mock(TemporaryFileShareMapper.class);
        objectStore = mock(TemporaryObjectStore.class);
        service = new TemporaryFileShareService(
                mapper,
                objectStore,
                properties(),
                new java.security.SecureRandom(),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void createsASecretShareWithServerOwnedFiveMinuteSingleUsePolicy() throws Exception {
        var file = new MockMultipartFile("file", "../报告.txt", "text/plain", "hello".getBytes());
        var objectPath = "tool-web/temporary-file-shares/6f1725b4-9c8b-49df-8f3d-f51e266f10ff/报告.txt";
        when(objectStore.store(any(), org.mockito.ArgumentMatchers.eq(5L), org.mockito.ArgumentMatchers.eq("报告.txt")))
                .thenReturn(new TemporaryObjectStore.StoredObject(
                        "6f1725b4-9c8b-49df-8f3d-f51e266f10ff", objectPath, 5, "sha"));
        when(mapper.insert(any(TemporaryFileShare.class))).thenReturn(1);

        var created = service.create(file);

        assertThat(created.originalFilename()).isEqualTo("报告.txt");
        assertThat(created.expiresAt()).isEqualTo(NOW.plus(Duration.ofMinutes(5)));
        assertThat(created.maxDownloads()).isOne();
        assertThat(created.accessKey()).hasSize(43);
        var persisted = org.mockito.ArgumentCaptor.forClass(TemporaryFileShare.class);
        verify(mapper).insert(persisted.capture());
        assertThat(persisted.getValue().accessKeyDigest())
                .hasSize(64)
                .matches("[0-9a-f]{64}")
                .isNotEqualTo(created.accessKey());
        assertThat(persisted.getValue().deleted()).isFalse();
        assertThat(persisted.getValue().deletedAt()).isNull();
        assertThat(persisted.getValue().objectPath()).isEqualTo(objectPath);
    }

    @Test
    void wrongKeyDoesNotConsumeTheShare() throws Exception {
        var share = activeShare("correct-key", NOW.plusSeconds(60));
        when(mapper.selectForUpdate(share.shareId())).thenReturn(Optional.of(share));

        assertThatThrownBy(() -> service.authorizeDownload(share.shareId(), "wrong-key"))
                .isInstanceOfSatisfying(FileShareAccessException.class,
                        exception -> assertThat(exception.reason()).isEqualTo(FileShareAccessException.Reason.INVALID));

        assertThat(share.downloadCount()).isZero();
        verify(objectStore, never()).open(any());
    }

    @Test
    void consumesTheOnlyDownloadAuthorizationAtomically() throws Exception {
        var share = activeShare("correct-key", NOW.plusSeconds(60));
        when(mapper.selectForUpdate(share.shareId())).thenReturn(Optional.of(share));
        when(mapper.updateById(share)).thenReturn(1);
        when(objectStore.open(share.storagePath()))
                .thenReturn(new org.springframework.core.io.InputStreamResource(new ByteArrayInputStream("hello".getBytes())));

        var grant = service.authorizeDownload(share.shareId(), "correct-key");

        assertThat(grant.originalFilename()).isEqualTo("report.txt");
        assertThat(share.downloadCount()).isOne();
        assertThat(share.status()).isEqualTo(TemporaryFileShare.Status.CONSUMED);
        verify(mapper).updateById(share);
        assertThatThrownBy(() -> service.authorizeDownload(share.shareId(), "correct-key"))
                .isInstanceOfSatisfying(FileShareAccessException.class,
                        exception -> assertThat(exception.reason()).isEqualTo(FileShareAccessException.Reason.CONSUMED));
    }

    @Test
    void rejectsAnExpiredShareBeforeOpeningStorage() throws Exception {
        var share = activeShare("correct-key", NOW);
        when(mapper.selectForUpdate(share.shareId())).thenReturn(Optional.of(share));

        assertThatThrownBy(() -> service.authorizeDownload(share.shareId(), "correct-key"))
                .isInstanceOfSatisfying(FileShareAccessException.class,
                        exception -> assertThat(exception.reason()).isEqualTo(FileShareAccessException.Reason.EXPIRED));
        verify(objectStore, never()).open(any());
    }

    @Test
    void removesOldOrphanedObjectsLeftBeforeDatabaseCommit() throws Exception {
        when(mapper.selectExpiredActive(any(), org.mockito.ArgumentMatchers.eq(100))).thenReturn(List.of());
        when(objectStore.findOlderThan(any(), org.mockito.ArgumentMatchers.eq(100)))
                .thenReturn(List.of(new TemporaryObjectStore.StoredObjectReference(
                        "6f1725b4-9c8b-49df-8f3d-f51e266f10ff",
                        "tool-web/temporary-file-shares/6f1725b4-9c8b-49df-8f3d-f51e266f10ff/report.txt")));
        when(mapper.existsActiveByObjectKey("6f1725b4-9c8b-49df-8f3d-f51e266f10ff"))
                .thenReturn(false);

        assertThat(service.cleanupExpired()).isOne();
        verify(objectStore).delete(
                "tool-web/temporary-file-shares/6f1725b4-9c8b-49df-8f3d-f51e266f10ff/report.txt");
    }

    @Test
    void removesExpiredObjectAndMarksMetadataAsLogicallyDeleted() throws Exception {
        var share = activeShare("correct-key", NOW.minus(Duration.ofMinutes(3)));
        when(mapper.selectExpiredActive(any(), org.mockito.ArgumentMatchers.eq(100))).thenReturn(List.of(share));
        when(mapper.markDeleted(
                org.mockito.ArgumentMatchers.eq(share.shareId()),
                org.mockito.ArgumentMatchers.eq(NOW),
                org.mockito.ArgumentMatchers.eq(share.version())))
                .thenReturn(1);
        when(objectStore.findOlderThan(any(), org.mockito.ArgumentMatchers.eq(100))).thenReturn(List.of());

        assertThat(service.cleanupExpired()).isOne();

        verify(objectStore).delete(share.storagePath());
        verify(mapper).markDeleted(share.shareId(), NOW, 0);
        assertThat(share.deleted()).isTrue();
        assertThat(share.deletedAt()).isEqualTo(NOW);
    }

    @Test
    void logicalDeletionKeepsTheFirstDeletionTimestamp() {
        var share = activeShare("correct-key", NOW.minus(Duration.ofMinutes(3)));

        share.markDeleted(NOW);
        share.markDeleted(NOW.plusSeconds(30));

        assertThat(share.deleted()).isTrue();
        assertThat(share.deletedAt()).isEqualTo(NOW);
    }

    @Test
    void legacyRowsWithoutAnObjectPathFallBackToTheStableObjectKey() {
        var share = TemporaryFileShare.create(
                "40f68803-28ec-47a3-a986-7d874dd82f04",
                sha256("correct-key"),
                "6f1725b4-9c8b-49df-8f3d-f51e266f10ff",
                null,
                "legacy.txt",
                "application/octet-stream",
                5,
                "sha",
                NOW,
                NOW.plusSeconds(60),
                1);

        assertThat(share.storagePath()).isEqualTo(share.objectKey());
    }

    private TemporaryFileShare activeShare(String key, Instant expiresAt) {
        return TemporaryFileShare.create(
                "40f68803-28ec-47a3-a986-7d874dd82f04",
                sha256(key),
                "6f1725b4-9c8b-49df-8f3d-f51e266f10ff",
                "tool-web/temporary-file-shares/6f1725b4-9c8b-49df-8f3d-f51e266f10ff/report.txt",
                "report.txt",
                "application/octet-stream",
                5,
                "sha",
                NOW,
                expiresAt,
                1);
    }

    private String sha256(String value) {
        try {
            var digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private TemporaryFileShareProperties properties() {
        return new TemporaryFileShareProperties(
                "./target/test-files", DataSize.ofMegabytes(10), DataSize.ofMegabytes(20),
                Duration.ofMinutes(5), 1, 2, Duration.ofSeconds(30), Duration.ofMinutes(2), 100,
                TemporaryFileShareProperties.StorageProvider.FILESYSTEM);
    }
}
