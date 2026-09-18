package com.toolweb.platform.tool.document.client;

import com.sun.net.httpserver.HttpServer;
import com.toolweb.platform.tool.document.config.DocumentConversionProperties;
import com.toolweb.platform.tool.document.dto.DocumentConversionModels;
import com.toolweb.platform.tool.document.exception.DocumentConversionException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;
import tools.jackson.databind.ObjectMapper;

import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HttpDocumentConversionWorkerTest {

    private HttpServer server;
    private HttpDocumentConversionWorker worker;

    @AfterEach
    void closeResources() throws Exception {
        if (worker != null) worker.close();
        if (server != null) server.stop(0);
    }

    @Test
    void streamsTheDocumentWithAuthenticatedMetadataAndParsesTheResponse() throws Exception {
        var observed = new AtomicReference<ObservedRequest>();
        startServer(exchange -> {
            observed.set(new ObservedRequest(
                    exchange.getRequestHeaders().getFirst("Authorization"),
                    exchange.getRequestHeaders().getFirst("X-Request-Id"),
                    exchange.getRequestHeaders().getFirst("X-File-Extension"),
                    exchange.getRequestHeaders().getFirst("X-File-Name-B64"),
                    exchange.getRequestBody().readAllBytes()));
            var json = """
                    {"schemaVersion":"1.0","requestId":"request-7","title":"说明",\
                    "markdown":"# 说明","source":{"filename":"说明.docx","extension":".docx",\
                    "contentType":"application/octet-stream","sizeBytes":7},"engine":"markitdown",\
                    "engineVersion":"1.0","metrics":{"durationMs":12,"markdownCharacters":4},"warnings":[]}
                    """.replace("\\\n", "");
            var body = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        worker = new HttpDocumentConversionWorker(properties(), new ObjectMapper());
        var file = new MockMultipartFile("file", "说明.docx", "application/octet-stream", "content".getBytes());

        var result = worker.convert(
                new DocumentConversionModels.ValidatedUpload(file, "说明.docx", ".docx"), "request-7");

        assertThat(result.markdown()).isEqualTo("# 说明");
        assertThat(result.metrics().durationMs()).isEqualTo(12);
        assertThat(observed.get().authorization()).isEqualTo("Bearer worker-secret");
        assertThat(observed.get().requestId()).isEqualTo("request-7");
        assertThat(observed.get().extension()).isEqualTo(".docx");
        assertThat(new String(Base64.getUrlDecoder().decode(observed.get().filename()), StandardCharsets.UTF_8))
                .isEqualTo("说明.docx");
        assertThat(observed.get().body()).isEqualTo("content".getBytes());
    }

    @Test
    void mapsAWorkerConversionFailureWithoutLeakingItsBody() throws Exception {
        startServer(exchange -> {
            var body = "{\"error\":{\"code\":\"document_conversion_failed\",\"message\":\"internal\",\"requestId\":\"r\"}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(422, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        worker = new HttpDocumentConversionWorker(properties(), new ObjectMapper());
        var file = new MockMultipartFile("file", "report.pdf", "application/pdf", "pdf".getBytes());

        assertThatThrownBy(() -> worker.convert(
                new DocumentConversionModels.ValidatedUpload(file, "report.pdf", ".pdf"), "request-8"))
                .isInstanceOfSatisfying(DocumentConversionException.class,
                        exception -> assertThat(exception.reason())
                                .isEqualTo(DocumentConversionException.Reason.CONVERSION_FAILED));
    }

    @Test
    void rejectsASuccessResponseWhoseRequestMetadataDoesNotMatch() throws Exception {
        startServer(exchange -> {
            var body = """
                    {"schemaVersion":"1.0","requestId":"different-request","title":null,"markdown":"# x",\
                    "source":{"filename":"report.pdf","extension":".pdf","contentType":"application/octet-stream",\
                    "sizeBytes":999},"engine":"markitdown","engineVersion":"1.0",\
                    "metrics":{"durationMs":1,"markdownCharacters":3},"warnings":[]}
                    """.replace("\\\n", "").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        worker = new HttpDocumentConversionWorker(properties(), new ObjectMapper());
        var file = new MockMultipartFile("file", "report.pdf", "application/pdf", "pdf".getBytes());

        assertThatThrownBy(() -> worker.convert(
                new DocumentConversionModels.ValidatedUpload(file, "report.pdf", ".pdf"), "request-9"))
                .isInstanceOfSatisfying(DocumentConversionException.class,
                        exception -> assertThat(exception.reason())
                                .isEqualTo(DocumentConversionException.Reason.WORKER_PROTOCOL_ERROR));
    }

    private void startServer(com.sun.net.httpserver.HttpHandler handler) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/v1/conversions", handler);
        server.start();
    }

    private DocumentConversionProperties properties() {
        return new DocumentConversionProperties(
                URI.create("http://127.0.0.1:" + server.getAddress().getPort()), "worker-secret",
                DataSize.ofMegabytes(10), DataSize.ofMegabytes(2), Duration.ofSeconds(2), Duration.ofSeconds(5), 2);
    }

    private record ObservedRequest(
            String authorization,
            String requestId,
            String extension,
            String filename,
            byte[] body
    ) {
    }
}
