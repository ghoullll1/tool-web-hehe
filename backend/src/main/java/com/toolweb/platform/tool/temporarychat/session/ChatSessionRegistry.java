package com.toolweb.platform.tool.temporarychat.session;

import org.springframework.web.socket.WebSocketSession;

import java.time.Instant;
import java.util.Collection;
import java.util.Optional;

public interface ChatSessionRegistry {

    ChatRoom create(String sessionId, String creatorTicketDigest, Instant joinDeadlineAt);

    void reserveParticipant(String sessionId, String participantTicketDigest);

    ChatRoom.Authentication authenticate(String ticketDigest, WebSocketSession socket, Instant now);

    Optional<ChatConnectionBinding> findBySocketId(String socketId);

    Optional<ChatRoom> findBySessionId(String sessionId);

    Collection<ChatRoom> rooms();

    Optional<ChatRoom> remove(String sessionId);
}
