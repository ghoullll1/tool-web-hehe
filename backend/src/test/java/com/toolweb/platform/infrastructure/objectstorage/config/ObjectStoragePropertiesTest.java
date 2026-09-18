package com.toolweb.platform.infrastructure.objectstorage.config;

import org.junit.jupiter.api.Test;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ObjectStoragePropertiesTest {

    @Test
    void suppliesRustFsCompatibleDefaultsAndNormalizesTheBasePrefix() {
        var properties = properties(null, " /tenant-a ", "access", "secret");

        assertThat(properties.endpoint()).isEqualTo(URI.create("http://127.0.0.1:9000"));
        assertThat(properties.region()).isEqualTo("us-east-1");
        assertThat(properties.bucket()).isEqualTo("temp-files");
        assertThat(properties.basePrefix()).isEqualTo("tenant-a/");
        assertThat(properties.maxConnections()).isEqualTo(32);
    }

    @Test
    void rejectsMissingCredentialsAndNonHttpEndpointsInRustFsMode() {
        assertThatThrownBy(() -> properties(URI.create("http://127.0.0.1:9000"), null, "", "").validateForS3())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("access key");
        assertThatThrownBy(() -> properties(URI.create("file:///tmp/rustfs"), null, "access", "secret").validateForS3())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTP(S)");
        assertThatThrownBy(() -> properties(URI.create("http://127.0.0.1:9000/api"), null, "access", "secret").validateForS3())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTP(S)");
        assertThatThrownBy(() -> properties(URI.create("http://127.0.0.1:9000"), "../outside", "access", "secret").validateForS3())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("base prefix");
    }

    private ObjectStorageProperties properties(
            URI endpoint,
            String basePrefix,
            String accessKey,
            String secretKey
    ) {
        return new ObjectStorageProperties(
                endpoint, null, null, basePrefix, accessKey, secretKey, true,
                null, null, null, null, 0);
    }
}
