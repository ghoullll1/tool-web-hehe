package com.toolweb.platform.tool.temporarychat.websocket;

import com.toolweb.platform.tool.temporarychat.config.TemporaryChatProperties;
import com.toolweb.platform.tool.temporarychat.protocol.ChatFrame;
import com.toolweb.platform.tool.temporarychat.protocol.ChatMessageType;
import com.toolweb.platform.tool.temporarychat.protocol.ChatProtocolCodec;
import com.toolweb.platform.tool.temporarychat.routing.ChatMessageRouter;
import com.toolweb.platform.tool.temporarychat.service.TemporaryChatRealtimeService;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TemporaryChatWebSocketHandlerTest {

    @Test
    void closesAnUnauthenticatedConnectionAfterTheFirstRejectedFrame() {
        var codec = mock(ChatProtocolCodec.class);
        var router = mock(ChatMessageRouter.class);
        var realtime = mock(TemporaryChatRealtimeService.class);
        var socket = mock(WebSocketSession.class);
        var message = new TextMessage("{}");
        var frame = new ChatFrame(
                "8be24d34-9284-44a7-bf61-8af2a006d73b", ChatMessageType.AUTH,
                Instant.parse("2026-09-20T07:00:00Z"), new ObjectMapper().createObjectNode()
        );
        when(socket.getId()).thenReturn("socket-1");
        when(codec.decode(message)).thenReturn(frame);
        doThrow(new IllegalArgumentException("bad ticket")).when(router).route(socket, frame);
        var handler = new TemporaryChatWebSocketHandler(
                codec, router, realtime, properties(),
                Clock.fixed(Instant.parse("2026-09-20T07:00:00Z"), ZoneOffset.UTC)
        );

        handler.afterConnectionEstablished(socket);
        handler.handleTextMessage(socket, message);

        verify(realtime).sendError(socket, "MESSAGE_REJECTED",
                "消息无效、发送过快，或当前会话状态不允许此操作。", true);
    }

    private TemporaryChatProperties properties() {
        return new TemporaryChatProperties(
                Duration.ofMinutes(3), Duration.ofMinutes(3), Duration.ofSeconds(5),
                Duration.ofSeconds(25), Duration.ofSeconds(75), Duration.ofSeconds(5),
                100, 4_000, 16_384, 20
        );
    }
}
