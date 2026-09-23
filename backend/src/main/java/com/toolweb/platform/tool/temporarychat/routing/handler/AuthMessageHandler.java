package com.toolweb.platform.tool.temporarychat.routing.handler;

import com.toolweb.platform.tool.temporarychat.protocol.ChatFrame;
import com.toolweb.platform.tool.temporarychat.protocol.ChatMessageType;
import com.toolweb.platform.tool.temporarychat.routing.ChatFrameHandler;
import com.toolweb.platform.tool.temporarychat.service.TemporaryChatRealtimeService;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

@Component
public class AuthMessageHandler implements ChatFrameHandler {

    private final TemporaryChatRealtimeService realtime;

    public AuthMessageHandler(TemporaryChatRealtimeService realtime) {
        this.realtime = realtime;
    }

    @Override public ChatMessageType type() { return ChatMessageType.AUTH; }
    @Override public void handle(WebSocketSession socket, ChatFrame frame) { realtime.authenticate(socket, frame); }
}
