package com.toolweb.platform.tool.document.config;

import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.net.URI;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DocumentConversionPropertiesTest {

    @Test
    void defaultsToThePublicTenMegabyteLimit() {
        var properties = new DocumentConversionProperties(
                null, null, null, null, null, null, 0);

        assertThat(properties.maxFileSize()).isEqualTo(DataSize.ofMegabytes(10));
        assertThat(properties.conversionEndpoint().toString())
                .isEqualTo("http://127.0.0.1:8091/internal/v1/conversions");
    }

    @Test
    void refusesConfigurationThatRelaxesTheTenMegabyteContract() {
        assertThatThrownBy(() -> new DocumentConversionProperties(
                URI.create("http://127.0.0.1:8091"), "", DataSize.ofMegabytes(11),
                DataSize.ofMegabytes(68), Duration.ofSeconds(3), Duration.ofSeconds(130), 2))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("10 MB");
    }

    @Test
    void refusesWorkerUrlsContainingCredentials() {
        assertThatThrownBy(() -> new DocumentConversionProperties(
                URI.create("http://user:pass@127.0.0.1:8091"), "", DataSize.ofMegabytes(10),
                DataSize.ofMegabytes(68), Duration.ofSeconds(3), Duration.ofSeconds(130), 2))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
