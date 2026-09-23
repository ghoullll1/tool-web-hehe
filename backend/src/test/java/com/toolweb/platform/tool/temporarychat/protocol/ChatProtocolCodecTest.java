package com.toolweb.platform.tool.temporarychat.protocol;

import com.toolweb.platform.tool.temporarychat.config.TemporaryChatProperties;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatProtocolCodecTest {

    private final ChatProtocolCodec codec = new ChatProtocolCodec(new ObjectMapper(), properties());

    @Test
    void decodesTheUnifiedEnvelopeWithoutAcceptingMissingIdentifiers() {
        var frame = codec.decode(new TextMessage("""
                {"messageId":"8be24d34-9284-44a7-bf61-8af2a006d73b","type":"CHAT","timestamp":"2026-09-20T07:00:00Z","data":{"text":"hello"}}
                """));

        assertThat(frame.type()).isEqualTo(ChatMessageType.CHAT);
        assertThat(codec.requiredDataText(frame, "text")).isEqualTo("hello");
        assertThatThrownBy(() -> codec.decode(new TextMessage("{\"type\":\"CHAT\",\"data\":{}}")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private TemporaryChatProperties properties() {
        return new TemporaryChatProperties(
                Duration.ofMinutes(3), Duration.ofMinutes(3), Duration.ofSeconds(5),
                Duration.ofSeconds(25), Duration.ofSeconds(75), Duration.ofSeconds(5),
                100, 4_000, 16_384, 20
        );
    }
}
