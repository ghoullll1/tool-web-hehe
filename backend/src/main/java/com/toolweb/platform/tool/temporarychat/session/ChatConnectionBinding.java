package com.toolweb.platform.tool.temporarychat.session;

import com.toolweb.platform.tool.temporarychat.entity.ChatRole;
import org.springframework.web.socket.WebSocketSession;

public record ChatConnectionBinding(ChatRoom room, ChatRole role, WebSocketSession socket) {
}
