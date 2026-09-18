package com.toolweb.platform.tool.fileshare.storage;

import com.toolweb.platform.infrastructure.objectstorage.config.ObjectStorageProperties;
import com.toolweb.platform.infrastructure.objectstorage.config.S3ObjectStorageConfiguration;
import com.toolweb.platform.infrastructure.objectstorage.service.ObjectStorageService;
import com.toolweb.platform.tool.fileshare.config.TemporaryFileShareProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

class TemporaryObjectStoreSelectionTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(StorageTestConfiguration.class);

    @Test
    void selectsOnlyTheFilesystemAdapterByDefault() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(TemporaryObjectStore.class);
            assertThat(context.getBean(TemporaryObjectStore.class))
                    .isInstanceOf(FileSystemTemporaryObjectStore.class);
            assertThat(context).doesNotHaveBean(ObjectStorageService.class);
        });
    }

    @Test
    void selectsOnlyTheRustFsAdapterWhenConfigured() {
        contextRunner
                .withPropertyValues(
                        "tool-platform.temporary-file-share.storage-provider=rustfs",
                        "tool-platform.object-storage.endpoint=http://127.0.0.1:9000",
                        "tool-platform.object-storage.access-key=test-access",
                        "tool-platform.object-storage.secret-key=test-secret")
                .run(context -> {
                    assertThat(context).hasSingleBean(TemporaryObjectStore.class);
                    assertThat(context.getBean(TemporaryObjectStore.class))
                            .isInstanceOf(RustFsTemporaryObjectStore.class);
                    assertThat(context).hasSingleBean(ObjectStorageService.class);
                });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties({TemporaryFileShareProperties.class, ObjectStorageProperties.class})
    @Import({
            FileSystemTemporaryObjectStore.class,
            RustFsTemporaryObjectStore.class,
            S3ObjectStorageConfiguration.class
    })
    static class StorageTestConfiguration {
    }
}
