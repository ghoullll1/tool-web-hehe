package com.toolweb.platform.web;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class RequestIdFilterTest {

    private final RequestIdFilter filter = new RequestIdFilter();

    @Test
    void keepsASafeCallerSuppliedRequestId() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", "trace-123");
        var response = new MockHttpServletResponse();
        var observed = new AtomicReference<String>();

        filter.doFilter(request, response, (incoming, outgoing) -> observed.set(
                (String) incoming.getAttribute(RequestIdFilter.ATTRIBUTE_NAME)));

        assertThat(observed.get()).isEqualTo("trace-123");
        assertThat(response.getHeader("X-Request-Id")).isEqualTo("trace-123");
    }

    @Test
    void replacesAnUnsafeRequestIdBeforeLoggingIt() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", "contains whitespace");
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, (incoming, outgoing) -> { });

        assertThat(response.getHeader("X-Request-Id"))
                .isNotEqualTo("contains whitespace")
                .matches("[0-9a-f-]{36}");
    }
}

