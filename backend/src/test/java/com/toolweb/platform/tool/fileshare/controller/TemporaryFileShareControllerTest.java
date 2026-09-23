package com.toolweb.platform.tool.fileshare.controller;

import com.toolweb.platform.tool.fileshare.dto.TemporaryFileShareModels;
import com.toolweb.platform.tool.fileshare.service.TemporaryFileShareService;
import com.toolweb.platform.tool.fileshare.service.PickupAttemptLimiter;
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
    void exposesOnlyTheCodeInCreationAndAcceptsItAsJson() throws Exception {
        var service = mock(TemporaryFileShareService.class);
        when(service.create(org.mockito.ArgumentMatchers.any())).thenReturn(new TemporaryFileShareModels.CreatedShare(
                "01234567", "report.txt", 5, "sha", Instant.parse("2026-09-14T08:05:00Z"),
                Instant.parse("2026-09-14T08:00:00Z"), 1));
        when(service.authorizeDownload("01234567")).thenReturn(new TemporaryFileShareModels.DownloadGrant(
                new ByteArrayResource("hello".getBytes()), "report.txt", 5, "sha"));
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                new TemporaryFileShareController(service, new PickupAttemptLimiter()))
                .setControllerAdvice(new TemporaryFileShareExceptionHandler()).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/v1/file-shares")
                        .file(new MockMultipartFile("file", "report.txt", "text/plain", "hello".getBytes())))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isCreated())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.pickupCode").value("01234567"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.shareId").doesNotExist())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.accessKey").doesNotExist());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/file-shares/download")
                        .contentType("application/json").content("{\"pickupCode\":\"01234567\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string("hello"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/file-shares/old-id/download")
                        .header("X-Share-Key", "old-key"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
    }

    @Test
    void uploadResponseIsPrivateAndReturnsTheOneTimeKeyOnce() {
        var service = mock(TemporaryFileShareService.class);
        var created = new TemporaryFileShareModels.CreatedShare(
                "01234567", "report.txt", 5, "sha", Instant.parse("2026-09-14T08:05:00Z"),
                Instant.parse("2026-09-14T08:00:00Z"), 1);
        var file = new MockMultipartFile("file", "report.txt", "text/plain", "hello".getBytes());
        when(service.create(file)).thenReturn(created);

        var response = new TemporaryFileShareController(service, new PickupAttemptLimiter()).create(file, new MockHttpServletRequest());

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(response.getHeaders().getCacheControl()).contains("no-store");
        assertThat(response.getBody()).isSameAs(created);
    }

    @Test
    void downloadForcesAnAttachmentAndForwardsOnlyTheExpectedMetadata() {
        var service = mock(TemporaryFileShareService.class);
        var resource = new ByteArrayResource("hello".getBytes());
        when(service.authorizeDownload("01234567"))
                .thenReturn(new TemporaryFileShareModels.DownloadGrant(resource, "报告.txt", 5, "sha-value"));

        var response = new TemporaryFileShareController(service, new PickupAttemptLimiter())
                .download(new TemporaryFileShareModels.PickupRequest("01234567"), new MockHttpServletRequest());

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getContentType().toString()).isEqualTo("application/octet-stream");
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION)).contains("attachment").contains("UTF-8");
        assertThat(response.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeaders().getFirst("Content-Security-Policy")).isEqualTo("sandbox");
        assertThat(response.getHeaders().getFirst(TemporaryFileShareController.FILE_SHA256_HEADER)).isEqualTo("sha-value");
        verify(service).authorizeDownload("01234567");
    }
}
