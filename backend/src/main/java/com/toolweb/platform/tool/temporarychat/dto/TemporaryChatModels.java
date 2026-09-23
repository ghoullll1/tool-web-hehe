package com.toolweb.platform.tool.temporarychat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class TemporaryChatModels {

    private TemporaryChatModels() {
    }

    public record CreateRequest(@Size(max = 32) String displayName) {
    }

    public record JoinRequest(
            @NotBlank @Size(max = 32) String sessionKey,
            @Size(max = 32) String displayName
    ) {
    }

    public record CreatedSession(
            String sessionId,
            String sessionKey,
            String creatorTicket,
            Instant expiresAt,
            Instant serverTime,
            String websocketPath
    ) {
    }

    public record JoinedSession(
            String sessionId,
            String participantTicket,
            Instant expiresAt,
            Instant serverTime,
            String websocketPath
    ) {
    }
}
