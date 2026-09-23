package com.toolweb.platform.tool.temporarychat.service;

import com.toolweb.platform.tool.temporarychat.config.TemporaryChatProperties;
import com.toolweb.platform.tool.temporarychat.dao.TemporaryChatSessionMapper;
import com.toolweb.platform.tool.temporarychat.dto.TemporaryChatModels;
import com.toolweb.platform.tool.temporarychat.entity.TemporaryChatSession;
import com.toolweb.platform.tool.temporarychat.exception.TemporaryChatException;
import com.toolweb.platform.tool.temporarychat.session.ChatSessionRegistry;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.UUID;

@Service
public class TemporaryChatService {

    public static final String WEBSOCKET_PATH = "/ws/v1/temporary-chat";

    private final TemporaryChatSessionMapper mapper;
    private final ChatSessionRegistry registry;
    private final TemporaryChatTokenService tokenService;
    private final TemporaryChatProperties properties;
    private final Clock clock;

    public TemporaryChatService(
            TemporaryChatSessionMapper mapper,
            ChatSessionRegistry registry,
            TemporaryChatTokenService tokenService,
            TemporaryChatProperties properties,
            @Qualifier("temporaryChatClock") Clock clock
    ) {
        this.mapper = mapper;
        this.registry = registry;
        this.tokenService = tokenService;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public TemporaryChatModels.CreatedSession create(TemporaryChatModels.CreateRequest request) {
        var now = clock.instant();
        var sessionId = UUID.randomUUID().toString();
        var creatorClientId = UUID.randomUUID().toString();
        var rawKey = tokenService.newSessionKey();
        var creatorTicket = tokenService.newTicket();
        var expiresAt = now.plus(properties.waitingTimeout());
        var session = TemporaryChatSession.waiting(
                sessionId,
                tokenService.digest(rawKey),
                creatorClientId,
                cleanDisplayName(request == null ? null : request.displayName()),
                now,
                expiresAt
        );

        registry.create(sessionId, tokenService.digest(creatorTicket), expiresAt);
        try {
            if (mapper.insert(session) != 1) {
                throw new IllegalStateException("Temporary chat session was not persisted");
            }
        } catch (RuntimeException exception) {
            registry.remove(sessionId);
            throw exception;
        }
        return new TemporaryChatModels.CreatedSession(
                sessionId, rawKey, creatorTicket, expiresAt, now, WEBSOCKET_PATH
        );
    }

    @Transactional
    public TemporaryChatModels.JoinedSession join(TemporaryChatModels.JoinRequest request) {
        var now = clock.instant();
        var normalizedKey = tokenService.normalizeSessionKey(request.sessionKey());
        var session = mapper.selectByKeyDigestForUpdate(tokenService.digest(normalizedKey))
                .filter(candidate -> candidate.status() == TemporaryChatSession.Status.WAITING)
                .filter(candidate -> candidate.participantClientId() == null)
                .filter(candidate -> now.isBefore(candidate.joinDeadlineAt()))
                .orElseThrow(this::unavailable);
        if (registry.findBySessionId(session.sessionId()).isEmpty()) throw unavailable();

        var participantClientId = UUID.randomUUID().toString();
        var participantTicket = tokenService.newTicket();
        int updated = mapper.reserveParticipant(
                session.sessionId(), participantClientId, cleanDisplayName(request.displayName()), now
        );
        if (updated != 1) throw unavailable();
        registry.reserveParticipant(session.sessionId(), tokenService.digest(participantTicket));

        return new TemporaryChatModels.JoinedSession(
                session.sessionId(), participantTicket, session.joinDeadlineAt(), now, WEBSOCKET_PATH
        );
    }

    private String cleanDisplayName(String value) {
        if (value == null || value.isBlank()) return null;
        var cleaned = value.strip();
        if (cleaned.codePoints().anyMatch(Character::isISOControl)) {
            throw new TemporaryChatException(
                    TemporaryChatException.Reason.INVALID_REQUEST,
                    "Temporary chat display name contains control characters"
            );
        }
        return cleaned;
    }

    private TemporaryChatException unavailable() {
        return new TemporaryChatException(
                TemporaryChatException.Reason.SESSION_UNAVAILABLE,
                "Temporary chat session is unavailable"
        );
    }
}
