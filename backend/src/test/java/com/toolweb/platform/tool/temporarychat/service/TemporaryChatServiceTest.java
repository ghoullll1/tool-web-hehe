package com.toolweb.platform.tool.temporarychat.service;

import com.toolweb.platform.tool.temporarychat.config.TemporaryChatProperties;
import com.toolweb.platform.tool.temporarychat.dao.TemporaryChatSessionMapper;
import com.toolweb.platform.tool.temporarychat.dto.TemporaryChatModels;
import com.toolweb.platform.tool.temporarychat.entity.TemporaryChatSession;
import com.toolweb.platform.tool.temporarychat.session.ChatRoom;
import com.toolweb.platform.tool.temporarychat.session.ChatSessionRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TemporaryChatServiceTest {

    @Test
    void createsAThreeMinuteSessionAndPersistsOnlyTheKeyDigest() {
        var fixture = fixture();
        when(fixture.mapper.insert(any(TemporaryChatSession.class))).thenReturn(1);

        var created = fixture.service.create(new TemporaryChatModels.CreateRequest("  小林  "));

        assertThat(created.sessionKey()).matches("[A-HJ-NP-Z2-9-]{14}");
        assertThat(created.creatorTicket()).hasSize(43);
        assertThat(created.expiresAt()).isEqualTo(fixture.now.plusSeconds(180));
        var entity = ArgumentCaptor.forClass(TemporaryChatSession.class);
        verify(fixture.mapper).insert(entity.capture());
        assertThat(entity.getValue().sessionKeyDigest()).hasSize(64).isNotEqualTo(created.sessionKey());
        assertThat(entity.getValue().creatorDisplayName()).isEqualTo("小林");
    }

    @Test
    void rejectsASecondParticipantWhenTheAtomicReservationLoses() {
        var fixture = fixture();
        var waiting = TemporaryChatSession.waiting(
                "session", fixture.tokens.digest("ABCD-EFGH-JKMN"), "creator", null,
                fixture.now, fixture.now.plusSeconds(180)
        );
        when(fixture.mapper.selectByKeyDigestForUpdate(waiting.sessionKeyDigest())).thenReturn(Optional.of(waiting));
        when(fixture.registry.findBySessionId("session")).thenReturn(Optional.of(mock(ChatRoom.class)));
        when(fixture.mapper.reserveParticipant(anyString(), anyString(), any(), any())).thenReturn(0);

        assertThatThrownBy(() -> fixture.service.join(
                new TemporaryChatModels.JoinRequest("ABCD-EFGH-JKMN", null)))
                .isInstanceOf(RuntimeException.class);
        verify(fixture.registry, never()).reserveParticipant(anyString(), anyString());
    }

    private Fixture fixture() {
        var mapper = mock(TemporaryChatSessionMapper.class);
        var registry = mock(ChatSessionRegistry.class);
        var tokens = new TemporaryChatTokenService();
        var now = Instant.parse("2026-09-20T07:00:00Z");
        var properties = new TemporaryChatProperties(
                Duration.ofMinutes(3), Duration.ofMinutes(3), Duration.ofSeconds(5),
                Duration.ofSeconds(25), Duration.ofSeconds(75), Duration.ofSeconds(5),
                100, 4_000, 16_384, 20
        );
        var service = new TemporaryChatService(
                mapper, registry, tokens, properties, Clock.fixed(now, ZoneOffset.UTC));
        return new Fixture(mapper, registry, tokens, service, now);
    }

    private record Fixture(
            TemporaryChatSessionMapper mapper,
            ChatSessionRegistry registry,
            TemporaryChatTokenService tokens,
            TemporaryChatService service,
            Instant now
    ) {
    }
}
