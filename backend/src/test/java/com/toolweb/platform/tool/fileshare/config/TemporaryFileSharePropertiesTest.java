package com.toolweb.platform.tool.fileshare.config;

import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TemporaryFileSharePropertiesTest {

    @Test
    void suppliesTheNonOverridableProductPolicy() {
        var properties = properties(null, 0);

        assertThat(properties.expiresAfter()).isEqualTo(Duration.ofMinutes(5));
        assertThat(properties.maxDownloads()).isOne();
    }

    @Test
    void rejectsDeploymentOverridesThatWouldDriftFromTheUserContract() {
        assertThatThrownBy(() -> properties(Duration.ofMinutes(10), 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("five-minute");
        assertThatThrownBy(() -> properties(Duration.ofMinutes(5), 2))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("exactly one");
    }

    private TemporaryFileShareProperties properties(Duration expiry, int downloads) {
        return new TemporaryFileShareProperties(
                "./target/test-files", DataSize.ofMegabytes(10), DataSize.ofMegabytes(20),
                expiry, downloads, 2, Duration.ofSeconds(30), Duration.ofMinutes(2), 100,
                TemporaryFileShareProperties.StorageProvider.FILESYSTEM);
    }
}
