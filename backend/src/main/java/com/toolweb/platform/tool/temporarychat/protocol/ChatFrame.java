package com.toolweb.platform.tool.temporarychat.protocol;

import tools.jackson.databind.JsonNode;

import java.time.Instant;

public record ChatFrame(String messageId, ChatMessageType type, Instant timestamp, JsonNode data) {
}
