package com.toolweb.platform.tool.temporarychat.protocol;

import com.toolweb.platform.tool.temporarychat.config.TemporaryChatProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class ChatProtocolCodec {

    private final ObjectMapper objectMapper;
    private final TemporaryChatProperties properties;

    public ChatProtocolCodec(ObjectMapper objectMapper, TemporaryChatProperties properties) {
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public ChatFrame decode(TextMessage message) {
        if (message.getPayload().getBytes(StandardCharsets.UTF_8).length > properties.maxFrameBytes()) {
            throw new IllegalArgumentException("WebSocket frame is too large");
        }
        try {
            var root = objectMapper.readTree(message.getPayload());
            var messageId = requiredText(root, "messageId");
            UUID.fromString(messageId);
            var type = ChatMessageType.valueOf(requiredText(root, "type"));
            var timestamp = root.hasNonNull("timestamp")
                    ? Instant.parse(root.get("timestamp").asText())
                    : Instant.now();
            var data = root.path("data");
            if (!data.isObject()) throw new IllegalArgumentException("Message data must be an object");
            return new ChatFrame(messageId, type, timestamp, data);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Invalid temporary chat frame", exception);
        }
    }

    public void send(WebSocketSession socket, String type, String correlationId, Map<String, ?> data) throws IOException {
        if (socket == null || !socket.isOpen()) return;
        var frame = new LinkedHashMap<String, Object>();
        frame.put("messageId", UUID.randomUUID().toString());
        frame.put("type", type);
        frame.put("timestamp", Instant.now());
        if (correlationId != null) frame.put("correlationId", correlationId);
        frame.put("data", data);
        socket.sendMessage(new TextMessage(objectMapper.writeValueAsString(frame)));
    }

    public String requiredDataText(ChatFrame frame, String field) {
        return requiredText(frame.data(), field);
    }

    private String requiredText(JsonNode node, String field) {
        var value = node.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException("Missing text field: " + field);
        }
        return value.asText();
    }
}
