package com.toolweb.platform.tool.temporarychat.session;

import com.toolweb.platform.tool.temporarychat.entity.ChatRole;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatRoomTest {

    @Test
    void admitsExactlyOneSocketPerRoleAndActivatesOnlyAfterBothConnect() {
        var start = Instant.parse("2026-09-20T07:00:00Z");
        var room = new ChatRoom("session", "creator-digest", start.plusSeconds(180), 16_384);
        room.reserveParticipant("participant-digest");
        var creator = socket("creator-socket");
        var participant = socket("participant-socket");

        assertThat(room.authenticate("creator-digest", creator, start).becameActive()).isFalse();
        assertThat(room.authenticate("participant-digest", participant, start.plusSeconds(1)).becameActive()).isTrue();
        assertThat(room.state()).isEqualTo(ChatRoom.State.ACTIVE);
        assertThatThrownBy(() -> room.authenticate("participant-digest", socket("intruder"), start.plusSeconds(2)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tracksOnlyMessageIdsForDeduplicationAndIndependentRoleActivity() {
        var start = Instant.parse("2026-09-20T07:00:00Z");
        var room = activeRoom(start);

        var first = room.acceptChat(ChatRole.CREATOR, "message-1", start.plusSeconds(2), 20);
        var duplicate = room.acceptChat(ChatRole.CREATOR, "message-1", start.plusSeconds(3), 20);

        assertThat(first.duplicate()).isFalse();
        assertThat(duplicate.duplicate()).isTrue();
        assertThat(room.inactiveRole(start.plusSeconds(181), Duration.ofMinutes(3)))
                .isEqualTo(ChatRole.PARTICIPANT);
    }

    private ChatRoom activeRoom(Instant start) {
        var room = new ChatRoom("session", "creator-digest", start.plusSeconds(180), 16_384);
        room.reserveParticipant("participant-digest");
        room.authenticate("creator-digest", socket("creator"), start);
        room.authenticate("participant-digest", socket("participant"), start.plusSeconds(1));
        return room;
    }

    private WebSocketSession socket(String id) {
        var socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn(id);
        when(socket.isOpen()).thenReturn(true);
        return socket;
    }
}
