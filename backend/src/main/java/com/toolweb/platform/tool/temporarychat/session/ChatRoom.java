package com.toolweb.platform.tool.temporarychat.session;

import com.toolweb.platform.tool.temporarychat.entity.ChatRole;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

public final class ChatRoom {

    public enum State { WAITING, ACTIVE, CLOSED }

    public record Authentication(ChatConnectionBinding binding, boolean becameActive) {
    }

    public record Dispatch(WebSocketSession peer, boolean duplicate) {
    }

    private static final int RECENT_MESSAGE_ID_LIMIT = 256;

    private final String sessionId;
    private final Instant joinDeadlineAt;
    private final int maxFrameBytes;
    private final Map<ChatRole, String> ticketDigests = new EnumMap<>(ChatRole.class);
    private final Map<ChatRole, WebSocketSession> sockets = new EnumMap<>(ChatRole.class);
    private final Map<ChatRole, Instant> connectedAt = new EnumMap<>(ChatRole.class);
    private final Map<ChatRole, Instant> lastMessageAt = new EnumMap<>(ChatRole.class);
    private final Map<ChatRole, Instant> lastPongAt = new EnumMap<>(ChatRole.class);
    private final Map<ChatRole, ArrayDeque<Instant>> messageWindows = new EnumMap<>(ChatRole.class);
    private final Map<ChatRole, LinkedHashSet<String>> recentMessageIds = new EnumMap<>(ChatRole.class);
    private State state = State.WAITING;

    public ChatRoom(String sessionId, String creatorTicketDigest, Instant joinDeadlineAt, int maxFrameBytes) {
        this.sessionId = sessionId;
        this.joinDeadlineAt = joinDeadlineAt;
        this.maxFrameBytes = maxFrameBytes;
        ticketDigests.put(ChatRole.CREATOR, creatorTicketDigest);
        for (var role : ChatRole.values()) {
            messageWindows.put(role, new ArrayDeque<>());
            recentMessageIds.put(role, new LinkedHashSet<>());
        }
    }

    public synchronized void reserveParticipant(String participantTicketDigest) {
        requireOpen();
        if (ticketDigests.containsKey(ChatRole.PARTICIPANT)) {
            throw new IllegalStateException("Participant has already been reserved");
        }
        ticketDigests.put(ChatRole.PARTICIPANT, participantTicketDigest);
    }

    public synchronized ChatRole roleForTicket(String ticketDigest) {
        return ticketDigests.entrySet().stream()
                .filter(entry -> entry.getValue().equals(ticketDigest))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElse(null);
    }

    public synchronized Authentication authenticate(String ticketDigest, WebSocketSession rawSocket, Instant now) {
        requireOpen();
        if (!now.isBefore(joinDeadlineAt) && state == State.WAITING) {
            throw new IllegalStateException("Session join deadline has passed");
        }
        var role = roleForTicket(ticketDigest);
        if (role == null) throw new IllegalArgumentException("Unknown temporary chat ticket");
        var existing = sockets.get(role);
        if (existing != null && existing.isOpen()) {
            throw new IllegalStateException("This chat role is already connected");
        }
        var socket = new ConcurrentWebSocketSessionDecorator(rawSocket, 5_000, maxFrameBytes * 4);
        sockets.put(role, socket);
        connectedAt.putIfAbsent(role, now);
        lastPongAt.put(role, now);
        boolean becameActive = state == State.WAITING
                && sockets.get(ChatRole.CREATOR) != null
                && sockets.get(ChatRole.PARTICIPANT) != null;
        if (becameActive) {
            state = State.ACTIVE;
            lastMessageAt.put(ChatRole.CREATOR, now);
            lastMessageAt.put(ChatRole.PARTICIPANT, now);
        }
        return new Authentication(new ChatConnectionBinding(this, role, socket), becameActive);
    }

    public synchronized Dispatch acceptChat(ChatRole role, String messageId, Instant now, int maxMessagesPerTenSeconds) {
        if (state != State.ACTIVE) throw new IllegalStateException("Both peers are not connected");
        var ids = recentMessageIds.get(role);
        if (ids.contains(messageId)) return new Dispatch(sockets.get(role.peer()), true);

        var window = messageWindows.get(role);
        var threshold = now.minusSeconds(10);
        while (!window.isEmpty() && window.peekFirst().isBefore(threshold)) window.removeFirst();
        if (window.size() >= maxMessagesPerTenSeconds) {
            throw new IllegalStateException("Message rate exceeded");
        }
        window.addLast(now);
        ids.add(messageId);
        while (ids.size() > RECENT_MESSAGE_ID_LIMIT) {
            ids.remove(ids.iterator().next());
        }
        lastMessageAt.put(role, now);
        return new Dispatch(sockets.get(role.peer()), false);
    }

    public synchronized WebSocketSession peerSocket(ChatRole role) {
        return sockets.get(role.peer());
    }

    public synchronized void pong(ChatRole role, Instant now) {
        if (state != State.CLOSED) lastPongAt.put(role, now);
    }

    public synchronized boolean waitingExpired(Instant now) {
        return state == State.WAITING && !now.isBefore(joinDeadlineAt);
    }

    public synchronized ChatRole inactiveRole(Instant now, Duration inactivityTimeout) {
        if (state != State.ACTIVE) return null;
        for (var role : ChatRole.values()) {
            var last = lastMessageAt.get(role);
            if (last != null && !now.isBefore(last.plus(inactivityTimeout))) return role;
        }
        return null;
    }

    public synchronized ChatRole heartbeatTimedOutRole(Instant now, Duration heartbeatTimeout) {
        if (state == State.CLOSED) return null;
        for (var role : ChatRole.values()) {
            if (!sockets.containsKey(role)) continue;
            var last = lastPongAt.get(role);
            if (last != null && !now.isBefore(last.plus(heartbeatTimeout))) return role;
        }
        return null;
    }

    public synchronized List<WebSocketSession> openSockets() {
        return sockets.values().stream().filter(WebSocketSession::isOpen).toList();
    }

    public synchronized List<WebSocketSession> close() {
        state = State.CLOSED;
        var result = new ArrayList<>(sockets.values());
        sockets.clear();
        return result;
    }

    public synchronized Instant connectedAt(ChatRole role) {
        return connectedAt.get(role);
    }

    public synchronized State state() {
        return state;
    }

    public String sessionId() { return sessionId; }
    public Instant joinDeadlineAt() { return joinDeadlineAt; }

    private void requireOpen() {
        if (state == State.CLOSED) throw new IllegalStateException("Temporary chat session is closed");
    }
}
