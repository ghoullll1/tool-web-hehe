package com.toolweb.platform.tool.fileshare.controller;

import com.toolweb.platform.tool.fileshare.exception.FileShareAccessException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.assertj.core.api.Assertions.*;

class TemporaryFileShareExceptionHandlerTest {
    @Test void returnsTheSamePublicErrorForAllUnavailableCodes() {
        var handler = new TemporaryFileShareExceptionHandler();
        for (var reason : new FileShareAccessException.Reason[]{FileShareAccessException.Reason.INVALID,
                FileShareAccessException.Reason.EXPIRED, FileShareAccessException.Reason.CONSUMED}) {
            var response = handler.handleAccess(new FileShareAccessException(reason), new MockHttpServletRequest());
            assertThat(response.getStatusCode().value()).isEqualTo(404);
            assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
            assertThat(response.getBody().getDetail()).isEqualTo("取件码不正确、已过期或已被使用。");
        }
    }

    @Test void suppliesRetryAfterOnRateLimits() {
        var response = new TemporaryFileShareExceptionHandler().handleAccess(
                new FileShareAccessException(FileShareAccessException.Reason.RATE_LIMITED), new MockHttpServletRequest());
        assertThat(response.getStatusCode().value()).isEqualTo(429);
        assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("60");
    }
}
