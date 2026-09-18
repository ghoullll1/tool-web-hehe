package com.toolweb.platform.tool.document.service;

import com.toolweb.platform.tool.document.client.DocumentConversionWorker;
import com.toolweb.platform.tool.document.config.DocumentConversionProperties;
import com.toolweb.platform.tool.document.dto.DocumentConversionModels;
import com.toolweb.platform.tool.document.exception.DocumentConversionException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;

import java.net.URI;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DocumentConversionServiceTest {

    @Test
    void validatesAndNormalizesAConversionBeforeCallingTheWorker() {
        var worker = mock(DocumentConversionWorker.class);
        var service = new DocumentConversionService(worker, properties(DataSize.ofMegabytes(10)));
        var file = new MockMultipartFile("file", "C:\\uploads\\项目说明.DOCX",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content".getBytes());
        var expected = converted();
        when(worker.convert(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("request-1")))
                .thenReturn(expected);

        var actual = service.convert(file, "request-1");

        assertThat(actual).isSameAs(expected);
        var upload = org.mockito.ArgumentCaptor.forClass(DocumentConversionModels.ValidatedUpload.class);
        verify(worker).convert(upload.capture(), org.mockito.ArgumentMatchers.eq("request-1"));
        assertThat(upload.getValue().filename()).isEqualTo("项目说明.DOCX");
        assertThat(upload.getValue().extension()).isEqualTo(".docx");
    }

    @Test
    void rejectsAnEmptyDocument() {
        var service = new DocumentConversionService(mock(DocumentConversionWorker.class), properties(DataSize.ofMegabytes(10)));

        assertReason(() -> service.convert(
                new MockMultipartFile("file", "report.pdf", "application/pdf", new byte[0]), "request-1"),
                DocumentConversionException.Reason.EMPTY_FILE);
    }

    @Test
    void rejectsMoreThanTheConfiguredTenMegabytesBeforeCallingTheWorker() {
        var service = new DocumentConversionService(mock(DocumentConversionWorker.class), properties(DataSize.ofMegabytes(10)));
        var file = new MockMultipartFile("file", "report.pdf", "application/pdf",
                new byte[(int) DataSize.ofMegabytes(10).toBytes() + 1]);

        assertReason(() -> service.convert(file, "request-1"), DocumentConversionException.Reason.FILE_TOO_LARGE);
    }

    @Test
    void acceptsExactlyTenMegabytes() {
        var worker = mock(DocumentConversionWorker.class);
        var service = new DocumentConversionService(worker, properties(DataSize.ofMegabytes(10)));
        var file = new MockMultipartFile("file", "report.pdf", "application/pdf",
                new byte[(int) DataSize.ofMegabytes(10).toBytes()]);
        when(worker.convert(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(converted());

        service.convert(file, "request-1");

        verify(worker).convert(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("request-1"));
    }

    @Test
    void rejectsAFileTypeOutsideTheWorkerCapabilityList() {
        var service = new DocumentConversionService(mock(DocumentConversionWorker.class), properties(DataSize.ofMegabytes(10)));

        assertReason(() -> service.convert(
                new MockMultipartFile("file", "archive.zip", "application/zip", "zip".getBytes()), "request-1"),
                DocumentConversionException.Reason.UNSUPPORTED_EXTENSION);
    }

    @Test
    void preservesTheExtensionWhenAUnicodeFilenameMustBeShortened() {
        var worker = mock(DocumentConversionWorker.class);
        var service = new DocumentConversionService(worker, properties(DataSize.ofMegabytes(10)));
        var file = new MockMultipartFile("file", "文".repeat(220) + ".docx", "application/octet-stream", "x".getBytes());
        when(worker.convert(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(converted());

        service.convert(file, "request-1");

        var upload = org.mockito.ArgumentCaptor.forClass(DocumentConversionModels.ValidatedUpload.class);
        verify(worker).convert(upload.capture(), org.mockito.ArgumentMatchers.eq("request-1"));
        assertThat(upload.getValue().filename()).endsWith(".docx");
        assertThat(upload.getValue().filename().codePointCount(0, upload.getValue().filename().length()))
                .isEqualTo(180);
    }

    private void assertReason(Runnable action, DocumentConversionException.Reason reason) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(DocumentConversionException.class,
                        exception -> assertThat(exception.reason()).isEqualTo(reason));
    }

    private DocumentConversionProperties properties(DataSize maxFileSize) {
        return new DocumentConversionProperties(
                URI.create("http://127.0.0.1:8091"), "token", maxFileSize, DataSize.ofMegabytes(68),
                Duration.ofSeconds(3), Duration.ofSeconds(130), 2);
    }

    private DocumentConversionModels.ConvertedDocument converted() {
        return new DocumentConversionModels.ConvertedDocument(
                "1.0", "request-1", "Report", "# Report",
                new DocumentConversionModels.Source("report.pdf", ".pdf", "application/octet-stream", 7),
                "markitdown", "1.0", new DocumentConversionModels.Metrics(12, 8), List.of());
    }
}
