package com.toolweb.platform.tool.fileshare.storage;

import com.toolweb.platform.tool.fileshare.config.TemporaryFileShareProperties;
import com.toolweb.platform.tool.fileshare.exception.FileShareStorageException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.util.unit.DataSize;

import org.springframework.core.io.ByteArrayResource;
import java.nio.file.Path;
import java.nio.file.Files;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileSystemTemporaryObjectStoreTest {

    @TempDir
    Path root;

    @Test
    void storesHashesOpensAndDeletesAnOpaqueObject() throws Exception {
        var store = new FileSystemTemporaryObjectStore(properties(10, 20));

        var stored = store.store(new ByteArrayResource("hello".getBytes()), 5, "report.txt");

        assertThat(stored.objectKey()).matches("[0-9a-f-]{36}");
        assertThat(stored.sha256()).isEqualTo("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
        assertThat(store.open(stored.objectKey()).getContentAsByteArray()).isEqualTo("hello".getBytes());
        store.delete(stored.objectKey());
        assertThatThrownBy(() -> store.open(stored.objectKey()))
                .isInstanceOfSatisfying(FileShareStorageException.class,
                        exception -> assertThat(exception.reason()).isEqualTo(FileShareStorageException.Reason.OBJECT_MISSING));
    }

    @Test
    void rejectsOversizedAndTraversalInputs() {
        var store = new FileSystemTemporaryObjectStore(properties(4, 8));

        assertThatThrownBy(() -> store.store(new ByteArrayResource("hello".getBytes()), 5, "report.txt"))
                .isInstanceOfSatisfying(FileShareStorageException.class,
                        exception -> assertThat(exception.reason()).isEqualTo(FileShareStorageException.Reason.FILE_TOO_LARGE));
        assertThatThrownBy(() -> store.open("../secret"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void atomicallyReservesTheConfiguredStorageQuota() throws Exception {
        var store = new FileSystemTemporaryObjectStore(properties(6, 8));
        var first = store.store(new ByteArrayResource("123456".getBytes()), 6, "first.txt");

        assertThatThrownBy(() -> store.store(new ByteArrayResource("abc".getBytes()), 3, "second.txt"))
                .isInstanceOfSatisfying(FileShareStorageException.class,
                        exception -> assertThat(exception.reason()).isEqualTo(FileShareStorageException.Reason.CAPACITY_EXCEEDED));

        store.delete(first.objectKey());
        assertThat(store.store(new ByteArrayResource("abc".getBytes()), 3, "third.txt").sizeBytes()).isEqualTo(3);
    }

    @Test
    void removesCrashLeftStagingFilesAndFindsOldOpaqueObjects() throws Exception {
        var staging = root.resolve("6f1725b4-9c8b-49df-8f3d-f51e266f10ff.part");
        Files.writeString(staging, "partial");
        var store = new FileSystemTemporaryObjectStore(properties(10, 20));
        var stored = store.store(new ByteArrayResource("ok".getBytes()), 2, "report.txt");

        assertThat(staging).doesNotExist();
        assertThat(store.findOlderThan(java.time.Instant.now().plusSeconds(1), 10))
                .containsExactly(new TemporaryObjectStore.StoredObjectReference(stored.objectKey(), stored.objectPath()));
    }

    private TemporaryFileShareProperties properties(long maxFileBytes, long maxStoredBytes) {
        return new TemporaryFileShareProperties(
                root.toString(), DataSize.ofBytes(maxFileBytes), DataSize.ofBytes(maxStoredBytes),
                Duration.ofMinutes(5), 1, 2, Duration.ofSeconds(30), Duration.ofMinutes(2), 100,
                TemporaryFileShareProperties.StorageProvider.FILESYSTEM);
    }
}
