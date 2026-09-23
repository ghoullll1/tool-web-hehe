package com.toolweb.platform.tool.temporarychat.controller;

import com.toolweb.platform.tool.temporarychat.dto.TemporaryChatModels;
import com.toolweb.platform.tool.temporarychat.service.TemporaryChatService;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TemporaryChatControllerTest {

    @Test
    void creationReturnsTheSecretOnceAndForbidsCaching() {
        var service = mock(TemporaryChatService.class);
        var request = new TemporaryChatModels.CreateRequest("小林");
        var created = new TemporaryChatModels.CreatedSession(
                "session", "ABCD-EFGH-JKMN", "ticket",
                Instant.parse("2026-09-20T07:03:00Z"), Instant.parse("2026-09-20T07:00:00Z"),
                "/ws/v1/temporary-chat"
        );
        when(service.create(request)).thenReturn(created);

        var response = new TemporaryChatController(service).create(request);

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(response.getHeaders().getCacheControl()).contains("no-store");
        assertThat(response.getBody()).isSameAs(created);
    }
}
