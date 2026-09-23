package com.toolweb.platform.tool.temporarychat.websocket;

import com.toolweb.platform.tool.temporarychat.config.TemporaryChatProperties;
import com.toolweb.platform.tool.temporarychat.protocol.ChatMessageType;
import com.toolweb.platform.tool.temporarychat.protocol.ChatProtocolCodec;
import com.toolweb.platform.tool.temporarychat.routing.ChatMessageRouter;
import com.toolweb.platform.tool.temporarychat.service.TemporaryChatRealtimeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TemporaryChatWebSocketHandler extends AbstractWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(TemporaryChatWebSocketHandler.class);

    private final ChatProtocolCodec codec;
    private final ChatMessageRouter router;
    private final TemporaryChatRealtimeService realtime;
    private final TemporaryChatProperties properties;
    private final Clock clock;
    private final ConcurrentHashMap<String, PendingConnection> unauthenticated = new ConcurrentHashMap<>();

    public TemporaryChatWebSocketHandler(
            ChatProtocolCodec codec,
            ChatMessageRouter router,
            TemporaryChatRealtimeService realtime,
            TemporaryChatProperties properties,
            @Qualifier("temporaryChatClock") Clock clock
    ) {
        this.codec = codec;
        this.router = router;
        this.realtime = realtime;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        if (unauthenticated.size() >= properties.maxActiveSessions() * 2) {
            realtime.sendError(session, "CONNECTION_CAPACITY", "当前实时连接较多，请稍后重试。", true);
            return;
        }
        unauthenticated.put(session.getId(), new PendingConnection(session, clock.instant()));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            var frame = codec.decode(message);
            if (unauthenticated.containsKey(session.getId()) && frame.type() != ChatMessageType.AUTH) {
                realtime.sendError(session, "AUTH_REQUIRED", "连接后必须先完成会话认证。", true);
                return;
            }
            router.route(session, frame);
            if (frame.type() == ChatMessageType.AUTH) unauthenticated.remove(session.getId());
        } catch (IllegalArgumentException | IllegalStateException exception) {
            log.debug("Temporary chat frame rejected socketId={} reason={}",
                    session.getId(), exception.getClass().getSimpleName());
            boolean authenticationFailed = unauthenticated.remove(session.getId()) != null;
            realtime.sendError(session, "MESSAGE_REJECTED", "消息无效、发送过快，或当前会话状态不允许此操作。", authenticationFailed);
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
        realtime.sendError(session, "TEXT_ONLY", "临时会话只接受文本消息。", true);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.debug("Temporary chat transport closed socketId={} reason={}",
                session.getId(), exception.getClass().getSimpleName());
        realtime.disconnected(session.getId());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        unauthenticated.remove(session.getId());
        realtime.disconnected(session.getId());
    }

    public void closeExpiredUnauthenticatedConnections() {
        var threshold = clock.instant().minus(properties.authenticationTimeout());
        unauthenticated.forEach((socketId, pending) -> {
            if (pending.openedAt().isAfter(threshold)) return;
            if (unauthenticated.remove(socketId, pending)) {
                realtime.sendError(pending.socket(), "AUTH_TIMEOUT", "连接认证已超时，请重新建立会话。", true);
            }
        });
    }

    private record PendingConnection(WebSocketSession socket, Instant openedAt) {
    }
}
