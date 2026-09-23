package com.toolweb.platform.tool.temporarychat.session;

import com.toolweb.platform.tool.temporarychat.config.TemporaryChatProperties;
import com.toolweb.platform.tool.temporarychat.exception.TemporaryChatException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class LocalChatSessionRegistry implements ChatSessionRegistry {

    private final TemporaryChatProperties properties;
    private final ConcurrentHashMap<String, ChatRoom> rooms = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ChatRoom> tickets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ChatConnectionBinding> sockets = new ConcurrentHashMap<>();

    public LocalChatSessionRegistry(TemporaryChatProperties properties) {
        this.properties = properties;
    }

    @Override
    public synchronized ChatRoom create(String sessionId, String creatorTicketDigest, Instant joinDeadlineAt) {
        if (rooms.size() >= properties.maxActiveSessions()) {
            throw new TemporaryChatException(
                    TemporaryChatException.Reason.CAPACITY_EXCEEDED,
                    "Temporary chat capacity has been reached"
            );
        }
        var room = new ChatRoom(sessionId, creatorTicketDigest, joinDeadlineAt, properties.maxFrameBytes());
        if (rooms.putIfAbsent(sessionId, room) != null || tickets.putIfAbsent(creatorTicketDigest, room) != null) {
            rooms.remove(sessionId, room);
            throw new IllegalStateException("Temporary chat identifier collision");
        }
        return room;
    }

    @Override
    public void reserveParticipant(String sessionId, String participantTicketDigest) {
        var room = requireRoom(sessionId);
        room.reserveParticipant(participantTicketDigest);
        if (tickets.putIfAbsent(participantTicketDigest, room) != null) {
            throw new IllegalStateException("Temporary chat ticket collision");
        }
    }

    @Override
    public ChatRoom.Authentication authenticate(String ticketDigest, WebSocketSession socket, Instant now) {
        var room = tickets.get(ticketDigest);
        if (room == null) throw new IllegalArgumentException("Unknown temporary chat ticket");
        var authentication = room.authenticate(ticketDigest, socket, now);
        sockets.put(socket.getId(), authentication.binding());
        return authentication;
    }

    @Override
    public Optional<ChatConnectionBinding> findBySocketId(String socketId) {
        return Optional.ofNullable(sockets.get(socketId));
    }

    @Override
    public Optional<ChatRoom> findBySessionId(String sessionId) {
        return Optional.ofNullable(rooms.get(sessionId));
    }

    @Override
    public Collection<ChatRoom> rooms() {
        return List.copyOf(rooms.values());
    }

    @Override
    public Optional<ChatRoom> remove(String sessionId) {
        var room = rooms.remove(sessionId);
        if (room == null) return Optional.empty();
        tickets.entrySet().removeIf(entry -> entry.getValue() == room);
        sockets.entrySet().removeIf(entry -> entry.getValue().room() == room);
        return Optional.of(room);
    }

    private ChatRoom requireRoom(String sessionId) {
        var room = rooms.get(sessionId);
        if (room == null) {
            throw new TemporaryChatException(
                    TemporaryChatException.Reason.SESSION_UNAVAILABLE,
                    "Temporary chat session is unavailable"
            );
        }
        return room;
    }
}
