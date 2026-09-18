package com.toolweb.platform.tool.fileshare.controller;

import com.toolweb.platform.tool.fileshare.dto.TemporaryFileShareModels;
import com.toolweb.platform.tool.fileshare.service.TemporaryFileShareService;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockMultipartFile;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TemporaryFileShareControllerTest {

    @Test
    void uploadResponseIsPrivateAndReturnsTheOneTimeKeyOnce() {
        var service = mock(TemporaryFileShareService.class);
        var created = new TemporaryFileShareModels.CreatedShare(
                "share-id", "one-time-key", "report.txt", 5, "sha", Instant.parse("2026-09-14T08:05:00Z"),
                Instant.parse("2026-09-14T08:00:00Z"), 1);
        var file = new MockMultipartFile("file", "report.txt", "text/plain", "hello".getBytes());
        when(service.create(file)).thenReturn(created);

        var response = new TemporaryFileShareController(service).create(file, new MockHttpServletRequest());

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(response.getHeaders().getCacheControl()).contains("no-store");
        assertThat(response.getBody()).isSameAs(created);
    }

    @Test
    void downloadForcesAnAttachmentAndForwardsOnlyTheExpectedMetadata() {
        var service = mock(TemporaryFileShareService.class);
        var resource = new ByteArrayResource("hello".getBytes());
        when(service.authorizeDownload("share-id", "secret"))
                .thenReturn(new TemporaryFileShareModels.DownloadGrant(resource, "报告.txt", 5, "sha-value"));

        var response = new TemporaryFileShareController(service)
                .download("share-id", "secret", new MockHttpServletRequest());

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getContentType().toString()).isEqualTo("application/octet-stream");
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION)).contains("attachment").contains("UTF-8");
        assertThat(response.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeaders().getFirst("Content-Security-Policy")).isEqualTo("sandbox");
        assertThat(response.getHeaders().getFirst(TemporaryFileShareController.FILE_SHA256_HEADER)).isEqualTo("sha-value");
        verify(service).authorizeDownload("share-id", "secret");
    }
}
