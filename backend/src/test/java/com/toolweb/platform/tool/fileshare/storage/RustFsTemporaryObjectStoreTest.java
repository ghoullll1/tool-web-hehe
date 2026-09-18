package com.toolweb.platform.tool.fileshare.storage;

import com.toolweb.platform.infrastructure.objectstorage.exception.ObjectStorageException;
import com.toolweb.platform.infrastructure.objectstorage.model.ObjectStorageContent;
import com.toolweb.platform.infrastructure.objectstorage.model.ObjectStorageMetadata;
import com.toolweb.platform.infrastructure.objectstorage.service.ObjectStorageService;
import com.toolweb.platform.tool.fileshare.config.TemporaryFileShareProperties;
import com.toolweb.platform.tool.fileshare.exception.FileShareStorageException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.util.unit.DataSize;

import java.io.ByteArrayInputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RustFsTemporaryObjectStoreTest {

    private ObjectStorageService objectStorage;
    private RustFsTemporaryObjectStore store;

    @BeforeEach
    void setUp() {
        objectStorage = mock(ObjectStorageService.class);
        when(objectStorage.resolveObjectPath(any())).thenAnswer(invocation -> "tool-web/" + invocation.getArgument(0));
        store = new RustFsTemporaryObjectStore(objectStorage, properties());
    }

    @Test
    void hashesAndUploadsUnderTheFeaturePrefixWhileKeepingACompactDatabaseKey() throws Exception {
        var stored = store.store(new ByteArrayResource("hello".getBytes()), 5, "测试报告.pdf");

        assertThat(stored.objectKey()).matches("[0-9a-f-]{36}");
        assertThat(stored.objectPath())
                .isEqualTo("tool-web/temporary-file-shares/" + stored.objectKey() + "/测试报告.pdf");
        assertThat(stored.sizeBytes()).isEqualTo(5);
        assertThat(stored.sha256()).isEqualTo("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
        verify(objectStorage).putObject(
                eq(stored.objectPath()),
                any(ByteArrayResource.class),
                eq(5L),
                eq("application/octet-stream"));
    }

    @Test
    void checksExistenceBeforeReturningALazyStreamingResource() throws Exception {
        var key = "6f1725b4-9c8b-49df-8f3d-f51e266f10ff";
        var storageKey = "tool-web/temporary-file-shares/" + key + "/报告.txt";
        when(objectStorage.headObject(storageKey))
                .thenReturn(new ObjectStorageMetadata(storageKey, 5, "text/plain", Instant.now()));
        when(objectStorage.getObject(storageKey))
                .thenReturn(new ObjectStorageContent(
                        new ByteArrayInputStream("hello".getBytes()), 5, "text/plain", Instant.now()));

        var resource = store.open(storageKey);

        assertThat(resource.contentLength()).isEqualTo(5);
        assertThat(resource.getContentAsByteArray()).isEqualTo("hello".getBytes());
        verify(objectStorage).headObject(storageKey);
        verify(objectStorage).getObject(storageKey);
    }

    @Test
    void mapsListedObjectsBackToDatabaseKeysAndIgnoresUnexpectedNames() {
        var cutoff = Instant.parse("2026-09-18T00:00:00Z");
        when(objectStorage.listObjectsModifiedBefore("tool-web/temporary-file-shares/", cutoff, 10))
                .thenReturn(List.of(
                        new ObjectStorageMetadata(
                                "tool-web/temporary-file-shares/6f1725b4-9c8b-49df-8f3d-f51e266f10ff/报告.pdf",
                                5, null, cutoff.minusSeconds(1)),
                        new ObjectStorageMetadata("tool-web/temporary-file-shares/unexpected/file", 5, null, cutoff.minusSeconds(1)),
                        new ObjectStorageMetadata("another-feature/object", 5, null, cutoff.minusSeconds(1))));

        assertThat(store.findOlderThan(cutoff, 10))
                .containsExactly(new TemporaryObjectStore.StoredObjectReference(
                        "6f1725b4-9c8b-49df-8f3d-f51e266f10ff",
                        "tool-web/temporary-file-shares/6f1725b4-9c8b-49df-8f3d-f51e266f10ff/报告.pdf"));
    }

    @Test
    void translatesMissingObjectsToTheExistingFeatureError() {
        var key = "6f1725b4-9c8b-49df-8f3d-f51e266f10ff";
        when(objectStorage.headObject("tool-web/temporary-file-shares/" + key))
                .thenThrow(new ObjectStorageException(ObjectStorageException.Reason.NOT_FOUND));

        assertThatThrownBy(() -> store.open(key))
                .isInstanceOfSatisfying(FileShareStorageException.class,
                        exception -> assertThat(exception.reason()).isEqualTo(FileShareStorageException.Reason.OBJECT_MISSING));
    }

    private TemporaryFileShareProperties properties() {
        return new TemporaryFileShareProperties(
                "./target/test-files", DataSize.ofMegabytes(10), DataSize.ofMegabytes(20),
                Duration.ofMinutes(5), 1, 2, Duration.ofSeconds(30), Duration.ofMinutes(2), 100,
                TemporaryFileShareProperties.StorageProvider.RUSTFS);
    }
}
