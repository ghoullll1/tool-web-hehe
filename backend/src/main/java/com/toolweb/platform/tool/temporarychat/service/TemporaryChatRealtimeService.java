package com.toolweb.platform.tool.temporarychat.service;

import com.toolweb.platform.tool.temporarychat.config.TemporaryChatProperties;
import com.toolweb.platform.tool.temporarychat.entity.ChatRole;
import com.toolweb.platform.tool.temporarychat.entity.TemporaryChatSession;
import com.toolweb.platform.tool.temporarychat.protocol.ChatFrame;
import com.toolweb.platform.tool.temporarychat.protocol.ChatProtocolCodec;
import com.toolweb.platform.tool.temporarychat.session.ChatConnectionBinding;
import com.toolweb.platform.tool.temporarychat.session.ChatRoom;
import com.toolweb.platform.tool.temporarychat.session.ChatSessionRegistry;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class TemporaryChatRealtimeService {

    private final ChatSessionRegistry registry;
    private final TemporaryChatTokenService tokenService;
    private final TemporaryChatLifecycleService lifecycle;
    private final ChatProtocolCodec codec;
    private final TemporaryChatProperties properties;
    private final Clock clock;
    private final ConcurrentHashMap<String, Instant> heartbeatSentAt = new ConcurrentHashMap<>();

    public TemporaryChatRealtimeService(
            ChatSessionRegistry registry,
            TemporaryChatTokenService tokenService,
            TemporaryChatLifecycleService lifecycle,
            ChatProtocolCodec codec,
            TemporaryChatProperties properties,
            @Qualifier("temporaryChatClock") Clock clock
    ) {
        this.registry = registry;
        this.tokenService = tokenService;
        this.lifecycle = lifecycle;
        this.codec = codec;
        this.properties = properties;
        this.clock = clock;
    }

    public void authenticate(WebSocketSession socket, ChatFrame frame) {
        if (registry.findBySocketId(socket.getId()).isPresent()) {
            throw new IllegalStateException("WebSocket is already authenticated");
        }
        var ticket = codec.requiredDataText(frame, "ticket");
        var authentication = registry.authenticate(tokenService.digest(ticket), socket, clock.instant());
        var binding = authentication.binding();
        send(binding.socket(), "AUTHENTICATED", frame.messageId(), Map.of(
                "sessionId", binding.room().sessionId(),
                "role", binding.role().name(),
                "joinDeadlineAt", binding.room().joinDeadlineAt(),
                "inactivityTimeoutSeconds", properties.inactivityTimeout().toSeconds()
        ));
        if (authentication.becameActive()) {
            var now = clock.instant();
            lifecycle.markActive(
                    binding.room().sessionId(),
                    binding.room().connectedAt(ChatRole.CREATOR),
                    binding.room().connectedAt(ChatRole.PARTICIPANT),
                    now
            );
            for (var peer : binding.room().openSockets()) {
                send(peer, "PEER_CONNECTED", null, Map.of(
                        "sessionId", binding.room().sessionId(),
                        "connectedAt", now,
                        "inactivityTimeoutSeconds", properties.inactivityTimeout().toSeconds()
                ));
            }
        } else {
            send(binding.socket(), "WAITING_FOR_PEER", null, Map.of(
                    "expiresAt", binding.room().joinDeadlineAt()
            ));
        }
    }

    public void chat(WebSocketSession socket, ChatFrame frame) {
        var binding = requireBinding(socket);
        var text = codec.requiredDataText(frame, "text").strip();
        if (text.codePointCount(0, text.length()) > properties.maxMessageCharacters()) {
            throw new IllegalArgumentException("Chat message is too long");
        }
        var now = clock.instant();
        var dispatch = binding.room().acceptChat(
                binding.role(), frame.messageId(), now, properties.maxMessagesPerTenSeconds()
        );
        if (!dispatch.duplicate()) {
            lifecycle.touchMessage(binding.room().sessionId(), binding.role(), now);
            send(dispatch.peer(), "CHAT", frame.messageId(), Map.of(
                    "text", text,
                    "senderRole", binding.role().name(),
                    "sentAt", now
            ));
        }
        send(binding.socket(), "ACK", frame.messageId(), Map.of(
                "accepted", true,
                "duplicate", dispatch.duplicate()
        ));
    }

    public void acknowledge(WebSocketSession socket, ChatFrame frame) {
        var binding = requireBinding(socket);
        var acknowledgedId = codec.requiredDataText(frame, "messageId");
        send(binding.room().peerSocket(binding.role()), "DELIVERY_ACK", frame.messageId(), Map.of(
                "messageId", acknowledgedId,
                "deliveredBy", binding.role().name()
        ));
    }

    public void pong(WebSocketSession socket) {
        var binding = requireBinding(socket);
        binding.room().pong(binding.role(), clock.instant());
    }

    public void leave(WebSocketSession socket) {
        registry.findBySocketId(socket.getId())
                .ifPresent(binding -> closeRoom(binding.room(), "USER_LEFT", TemporaryChatSession.Status.CLOSED));
    }

    public void disconnected(String socketId) {
        registry.findBySocketId(socketId)
                .ifPresent(binding -> closeRoom(binding.room(), "PEER_DISCONNECTED", TemporaryChatSession.Status.CLOSED));
    }

    public void sweep() {
        var now = clock.instant();
        for (var room : registry.rooms()) {
            if (room.waitingExpired(now)) {
                closeRoom(room, "JOIN_TIMEOUT", TemporaryChatSession.Status.EXPIRED);
                continue;
            }
            var inactiveRole = room.inactiveRole(now, properties.inactivityTimeout());
            if (inactiveRole != null) {
                closeRoom(room, inactiveRole.name() + "_INACTIVE", TemporaryChatSession.Status.CLOSED);
                continue;
            }
            var heartbeatRole = room.heartbeatTimedOutRole(now, properties.heartbeatTimeout());
            if (heartbeatRole != null) {
                closeRoom(room, heartbeatRole.name() + "_HEARTBEAT_TIMEOUT", TemporaryChatSession.Status.CLOSED);
                continue;
            }
            for (var socket : room.openSockets()) {
                var lastSent = heartbeatSentAt.get(socket.getId());
                if (lastSent == null || !now.isBefore(lastSent.plus(properties.heartbeatInterval()))) {
                    send(socket, "PING", null, Map.of("sentAt", now));
                    heartbeatSentAt.put(socket.getId(), now);
                }
            }
        }
    }

    public void sendError(WebSocketSession socket, String code, String detail, boolean close) {
        send(socket, "ERROR", null, Map.of("code", code, "detail", detail));
        if (close) closeSocket(socket, CloseStatus.POLICY_VIOLATION);
    }

    private ChatConnectionBinding requireBinding(WebSocketSession socket) {
        return registry.findBySocketId(socket.getId())
                .orElseThrow(() -> new IllegalStateException("WebSocket has not authenticated"));
    }

    private void closeRoom(ChatRoom room, String reason, TemporaryChatSession.Status status) {
        var removed = registry.remove(room.sessionId());
        if (removed.isEmpty()) return;
        var now = clock.instant();
        lifecycle.close(room.sessionId(), status, reason, now);
        for (var socket : room.close()) {
            heartbeatSentAt.remove(socket.getId());
            send(socket, "SESSION_CLOSED", null, Map.of("reason", reason, "closedAt", now));
            closeSocket(socket, CloseStatus.NORMAL);
        }
    }

    private void send(WebSocketSession socket, String type, String correlationId, Map<String, ?> data) {
        try {
            codec.send(socket, type, correlationId, data);
        } catch (IOException exception) {
            if (socket != null) disconnected(socket.getId());
        }
    }

    private void closeSocket(WebSocketSession socket, CloseStatus status) {
        if (socket == null || !socket.isOpen()) return;
        try {
            socket.close(status);
        } catch (IOException ignored) {
            // The connection is already being discarded; there is no payload or credential to log.
        }
    }
}
