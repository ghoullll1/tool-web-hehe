package com.toolweb.platform.tool.temporarychat.routing.handler;

import com.toolweb.platform.tool.temporarychat.protocol.ChatFrame;
import com.toolweb.platform.tool.temporarychat.protocol.ChatMessageType;
import com.toolweb.platform.tool.temporarychat.routing.ChatFrameHandler;
import com.toolweb.platform.tool.temporarychat.service.TemporaryChatRealtimeService;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

@Component
public class PongMessageHandler implements ChatFrameHandler {
    private final TemporaryChatRealtimeService realtime;
    public PongMessageHandler(TemporaryChatRealtimeService realtime) { this.realtime = realtime; }
    @Override public ChatMessageType type() { return ChatMessageType.PONG; }
    @Override public void handle(WebSocketSession socket, ChatFrame frame) { realtime.pong(socket); }
}
