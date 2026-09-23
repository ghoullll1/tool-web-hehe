package com.toolweb.platform.tool.temporarychat.routing;

import com.toolweb.platform.tool.temporarychat.protocol.ChatFrame;
import com.toolweb.platform.tool.temporarychat.protocol.ChatMessageType;
import org.springframework.web.socket.WebSocketSession;

public interface ChatFrameHandler {
    ChatMessageType type();
    void handle(WebSocketSession socket, ChatFrame frame);
}
