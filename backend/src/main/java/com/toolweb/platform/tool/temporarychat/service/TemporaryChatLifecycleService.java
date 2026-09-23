package com.toolweb.platform.tool.temporarychat.service;

import com.toolweb.platform.tool.temporarychat.dao.TemporaryChatSessionMapper;
import com.toolweb.platform.tool.temporarychat.entity.ChatRole;
import com.toolweb.platform.tool.temporarychat.entity.TemporaryChatSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class TemporaryChatLifecycleService {

    private static final Logger log = LoggerFactory.getLogger(TemporaryChatLifecycleService.class);

    private final TemporaryChatSessionMapper mapper;
    private final Clock clock;

    public TemporaryChatLifecycleService(
            TemporaryChatSessionMapper mapper,
            @Qualifier("temporaryChatClock") Clock clock
    ) {
        this.mapper = mapper;
        this.clock = clock;
    }

    @Transactional
    public void markActive(String sessionId, Instant creatorConnectedAt, Instant participantConnectedAt, Instant connectedAt) {
        mapper.markActive(sessionId, creatorConnectedAt, participantConnectedAt, connectedAt);
    }

    @Transactional
    public void touchMessage(String sessionId, ChatRole role, Instant messageAt) {
        mapper.touchMessage(sessionId, role.name(), messageAt);
    }

    @Transactional
    public void close(String sessionId, TemporaryChatSession.Status status, String reason, Instant closedAt) {
        mapper.closeSession(sessionId, status.name(), closedAt, reason);
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void closeSessionsFromPreviousRuntime() {
        int closed = mapper.closeAllNonTerminal(clock.instant(), "SERVER_RESTART");
        if (closed > 0) {
            log.info("Closed {} temporary chat sessions left by a previous runtime", closed);
        }
    }
}
