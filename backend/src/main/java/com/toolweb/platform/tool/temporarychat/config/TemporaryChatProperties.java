package com.toolweb.platform.tool.temporarychat.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("tool-platform.temporary-chat")
public record TemporaryChatProperties(
        Duration waitingTimeout,
        Duration inactivityTimeout,
        Duration authenticationTimeout,
        Duration heartbeatInterval,
        Duration heartbeatTimeout,
        Duration cleanupInterval,
        int maxActiveSessions,
        int maxMessageCharacters,
        int maxFrameBytes,
        int maxMessagesPerTenSeconds
) {
    public TemporaryChatProperties {
        waitingTimeout = positiveOrDefault(waitingTimeout, Duration.ofMinutes(3));
        inactivityTimeout = positiveOrDefault(inactivityTimeout, Duration.ofMinutes(3));
        authenticationTimeout = positiveOrDefault(authenticationTimeout, Duration.ofSeconds(5));
        heartbeatInterval = positiveOrDefault(heartbeatInterval, Duration.ofSeconds(25));
        heartbeatTimeout = positiveOrDefault(heartbeatTimeout, Duration.ofSeconds(75));
        cleanupInterval = positiveOrDefault(cleanupInterval, Duration.ofSeconds(5));
        maxActiveSessions = bounded(maxActiveSessions, 1_000, 1, 10_000);
        maxMessageCharacters = bounded(maxMessageCharacters, 4_000, 1, 16_000);
        maxFrameBytes = bounded(maxFrameBytes, 16_384, 1_024, 65_536);
        maxMessagesPerTenSeconds = bounded(maxMessagesPerTenSeconds, 20, 1, 100);
        if (heartbeatTimeout.compareTo(heartbeatInterval) <= 0) {
            throw new IllegalArgumentException("Temporary chat heartbeat timeout must exceed its interval");
        }
    }

    private static Duration positiveOrDefault(Duration value, Duration fallback) {
        return value == null || value.isZero() || value.isNegative() ? fallback : value;
    }

    private static int bounded(int value, int fallback, int minimum, int maximum) {
        int resolved = value <= 0 ? fallback : value;
        return Math.max(minimum, Math.min(resolved, maximum));
    }
}
