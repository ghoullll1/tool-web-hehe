package com.toolweb.platform.tool.fileshare.service;

import com.toolweb.platform.tool.fileshare.exception.FileShareAccessException;
import org.junit.jupiter.api.Test;
import java.time.Clock;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PickupAttemptLimiterTest {
    @Test void boundsAttemptsAndAllowsRetryAfterWindow() {
        var clock = mock(Clock.class);
        when(clock.millis()).thenReturn(1000L);
        var limiter = new PickupAttemptLimiter(clock);
        for (int i = 0; i < 5; i++) limiter.check("peer");
        assertThatThrownBy(() -> limiter.check("peer")).isInstanceOfSatisfying(FileShareAccessException.class,
                error -> assertThat(error.reason()).isEqualTo(FileShareAccessException.Reason.RATE_LIMITED));
        limiter.check("other-peer");
        when(clock.millis()).thenReturn(61000L);
        assertThatCode(() -> limiter.check("peer")).doesNotThrowAnyException();
    }

    @Test void boundsDistributedGuessesAcrossPeers() {
        var limiter = new PickupAttemptLimiter();
        for (int i = 0; i < 60; i++) limiter.check("peer-" + i);
        assertThatThrownBy(() -> limiter.check("new-peer")).isInstanceOf(FileShareAccessException.class);
    }
}
