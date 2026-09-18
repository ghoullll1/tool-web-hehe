package com.toolweb.platform.tool.catalog.controller;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.toolweb.platform.tool.catalog.service.ToolCatalogService;
import com.toolweb.platform.tool.execution.service.ToolExecutionService;
import com.toolweb.platform.web.RequestIdFilter;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.header.writers.CacheControlHeadersWriter;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ToolCatalogControllerTest {

    @Test
    void recordsUsageWithoutReturningAResponseBody() {
        var catalogService = mock(ToolCatalogService.class);
        var controller = new ToolCatalogController(catalogService, mock(ToolExecutionService.class));

        var response = controller.incrementUsage("hash");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(response.getBody()).isNull();
        verify(catalogService).incrementUsage("hash");
    }

    @Test
    void allowsShortPublicCachingForThePublishedCatalog() {
        var catalogService = mock(ToolCatalogService.class);
        var executionService = mock(ToolExecutionService.class);
        var tools = List.<com.toolweb.platform.tool.catalog.dto.ToolDescriptor>of();
        when(catalogService.listPublished()).thenReturn(tools);

        var response = new ToolCatalogController(catalogService, executionService).listPublished();

        assertThat(response.getBody()).isSameAs(tools);
        assertThat(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL))
                .isEqualTo(ToolCatalogController.PUBLIC_CATALOG_CACHE_CONTROL);

        var servletResponse = new MockHttpServletResponse();
        servletResponse.setHeader(
                HttpHeaders.CACHE_CONTROL,
                response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL));
        new CacheControlHeadersWriter().writeHeaders(new MockHttpServletRequest(), servletResponse);

        assertThat(servletResponse.getHeader(HttpHeaders.CACHE_CONTROL))
                .isEqualTo(ToolCatalogController.PUBLIC_CATALOG_CACHE_CONTROL);
    }

    @Test
    void logsExecutionMetadataWithoutSerializingToolInput() {
        var controller = new ToolCatalogController(mock(ToolCatalogService.class), mock(ToolExecutionService.class));
        var request = new MockHttpServletRequest();
        request.setAttribute(RequestIdFilter.ATTRIBUTE_NAME, "request-log-test");
        var logger = (Logger) LoggerFactory.getLogger(ToolCatalogController.class);
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        logger.addAppender(appender);

        try {
            controller.execute(
                    "http-response-diagnostics",
                    new ToolCatalogController.ToolExecutionRequest(Map.of("secret", "private-token-sentinel")),
                    request);
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        assertThat(appender.list)
                .extracting(ILoggingEvent::getFormattedMessage)
                .anyMatch(message -> message.contains("http-response-diagnostics"))
                .noneMatch(message -> message.contains("private-token-sentinel"));
    }
}
