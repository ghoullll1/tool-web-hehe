package com.toolweb.platform.tool.document.controller;

import com.toolweb.platform.tool.document.dto.DocumentConversionModels;
import com.toolweb.platform.tool.document.service.DocumentConversionService;
import com.toolweb.platform.web.RequestIdFilter;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockMultipartFile;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DocumentConversionControllerTest {

    @Test
    void returnsANonCacheableConversionAndForwardsTheRequestId() {
        var service = mock(DocumentConversionService.class);
        var file = new MockMultipartFile("file", "report.pdf", "application/pdf", "pdf".getBytes());
        var converted = new DocumentConversionModels.ConvertedDocument(
                "1.0", "request-1", "Report", "# Report",
                new DocumentConversionModels.Source("report.pdf", ".pdf", "application/octet-stream", 3),
                "markitdown", "1.0", new DocumentConversionModels.Metrics(9, 8), List.of());
        when(service.convert(file, "request-1")).thenReturn(converted);
        var request = new MockHttpServletRequest();
        request.setAttribute(RequestIdFilter.ATTRIBUTE_NAME, "request-1");

        var response = new DocumentConversionController(service).convert(file, request);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getCacheControl()).contains("no-store");
        assertThat(response.getBody()).isSameAs(converted);
        verify(service).convert(file, "request-1");
    }
}
