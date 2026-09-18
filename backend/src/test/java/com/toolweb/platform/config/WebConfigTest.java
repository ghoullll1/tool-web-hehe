package com.toolweb.platform.config;

import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class WebConfigTest {

    @Test
    void exposesConfiguredLocalDevelopmentOriginsToApiRequests() {
        var properties = new PlatformProperties(
                new PlatformProperties.Security("admin", "test-password"),
                new PlatformProperties.Cors(List.of("http://localhost:5173", "http://127.0.0.1:5173")));
        var registry = new InspectableCorsRegistry();

        new WebConfig(properties).addCorsMappings(registry);

        var apiCors = registry.configurations().get("/api/**");
        assertThat(apiCors.getAllowedOrigins())
                .containsExactly("http://localhost:5173", "http://127.0.0.1:5173");
        assertThat(apiCors.getAllowedMethods()).contains("POST", "OPTIONS");
        assertThat(apiCors.getAllowedHeaders()).contains("X-Share-Key");
        assertThat(apiCors.getExposedHeaders()).contains("Content-Disposition", "X-File-Sha256");
        assertThat(apiCors.getAllowCredentials()).isTrue();
    }

    private static final class InspectableCorsRegistry extends CorsRegistry {
        Map<String, CorsConfiguration> configurations() {
            return getCorsConfigurations();
        }
    }
}
