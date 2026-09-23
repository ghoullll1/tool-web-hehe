package com.toolweb.platform.tool.temporarychat.routing;

import com.toolweb.platform.tool.temporarychat.protocol.ChatFrame;
import com.toolweb.platform.tool.temporarychat.protocol.ChatMessageType;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Component
public class ChatMessageRouter {

    private final Map<ChatMessageType, ChatFrameHandler> handlers;

    public ChatMessageRouter(List<ChatFrameHandler> handlers) {
        var indexed = new EnumMap<ChatMessageType, ChatFrameHandler>(ChatMessageType.class);
        for (var handler : handlers) {
            if (indexed.put(handler.type(), handler) != null) {
                throw new IllegalStateException("Duplicate temporary chat handler for " + handler.type());
            }
        }
        this.handlers = Map.copyOf(indexed);
    }

    public void route(WebSocketSession socket, ChatFrame frame) {
        var handler = handlers.get(frame.type());
        if (handler == null) throw new IllegalArgumentException("Unsupported temporary chat message type");
        handler.handle(socket, frame);
    }
}
