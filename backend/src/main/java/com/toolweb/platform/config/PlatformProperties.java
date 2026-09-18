package com.toolweb.platform.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties("tool-platform")
public record PlatformProperties(Security security, Cors cors) {

    public record Security(String adminUsername, String adminPassword) {
    }

    public record Cors(List<String> allowedOrigins) {
    }
}

