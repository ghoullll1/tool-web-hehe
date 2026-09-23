package com.toolweb.platform.tool.temporarychat.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TemporaryChatTokenServiceTest {

    private final TemporaryChatTokenService service = new TemporaryChatTokenService();

    @Test
    void createsReadableKeysAndOneWayDigests() {
        var key = service.newSessionKey();
        var ticket = service.newTicket();

        assertThat(key).matches("[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}");
        assertThat(ticket).hasSize(43);
        assertThat(service.digest(key)).hasSize(64).doesNotContain(key);
    }

    @Test
    void normalizesCaseButRejectsAmbiguousOrMalformedKeys() {
        assertThat(service.normalizeSessionKey("abcd-efgh-jkmn")).isEqualTo("ABCD-EFGH-JKMN");
        assertThatThrownBy(() -> service.normalizeSessionKey("ABCI-EFGH-JKMN"))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> service.normalizeSessionKey("not-a-key"))
                .isInstanceOf(RuntimeException.class);
    }
}
