package com.toolweb.platform.tool.document.client;

import com.toolweb.platform.tool.document.config.DocumentConversionProperties;
import com.toolweb.platform.tool.document.dto.DocumentConversionModels;
import com.toolweb.platform.tool.document.exception.DocumentConversionException;
import jakarta.annotation.PreDestroy;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.HttpEntity;
import org.apache.hc.core5.http.io.entity.InputStreamEntity;
import org.apache.hc.core5.util.Timeout;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static com.toolweb.platform.tool.document.exception.DocumentConversionException.Reason.*;

@Component
final class HttpDocumentConversionWorker implements DocumentConversionWorker {

    private final DocumentConversionProperties properties;
    private final ObjectMapper objectMapper;
    private final CloseableHttpClient client;

    HttpDocumentConversionWorker(DocumentConversionProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        var connectionConfig = ConnectionConfig.custom()
                .setConnectTimeout(Timeout.ofMilliseconds(properties.connectTimeout().toMillis()))
                .setSocketTimeout(Timeout.ofMilliseconds(properties.responseTimeout().toMillis()))
                .build();
        var manager = PoolingHttpClientConnectionManagerBuilder.create()
                .setDefaultConnectionConfig(connectionConfig)
                .setMaxConnTotal(properties.maxConcurrentConversions())
                .setMaxConnPerRoute(properties.maxConcurrentConversions())
                .build();
        this.client = HttpClients.custom()
                .setConnectionManager(manager)
                .disableAutomaticRetries()
                .disableRedirectHandling()
                .build();
    }

    @Override
    public DocumentConversionModels.ConvertedDocument convert(
            DocumentConversionModels.ValidatedUpload upload,
            String requestId
    ) {
        var request = new HttpPost(properties.conversionEndpoint());
        request.setConfig(RequestConfig.custom()
                .setConnectionRequestTimeout(Timeout.ofMilliseconds(properties.connectTimeout().toMillis()))
                .setResponseTimeout(Timeout.ofMilliseconds(properties.responseTimeout().toMillis()))
                .build());
        request.setHeader("Accept", ContentType.APPLICATION_JSON.getMimeType());
        request.setHeader("X-Request-Id", requestId);
        request.setHeader("X-File-Extension", upload.extension());
        request.setHeader("X-File-Name-B64", Base64.getUrlEncoder().withoutPadding()
                .encodeToString(upload.filename().getBytes(StandardCharsets.UTF_8)));
        if (!properties.workerToken().isBlank()) {
            request.setHeader("Authorization", "Bearer " + properties.workerToken());
        }

        try {
            request.setEntity(new InputStreamEntity(
                    upload.file().getInputStream(), upload.file().getSize(), ContentType.APPLICATION_OCTET_STREAM));
            return client.execute(request, response -> handleResponse(
                    response.getCode(), response.getEntity(), upload, requestId));
        } catch (DocumentConversionException exception) {
            throw exception;
        } catch (InterruptedIOException exception) {
            if (Thread.currentThread().isInterrupted()) {
                Thread.currentThread().interrupt();
            }
            throw new DocumentConversionException(isTimeout(exception) ? WORKER_TIMEOUT : WORKER_UNAVAILABLE, exception);
        } catch (IOException exception) {
            throw new DocumentConversionException(WORKER_UNAVAILABLE, exception);
        } finally {
            request.reset();
        }
    }

    private DocumentConversionModels.ConvertedDocument handleResponse(
            int status,
            HttpEntity entity,
            DocumentConversionModels.ValidatedUpload upload,
            String requestId
    ) throws IOException {
        var body = readLimited(entity);
        if (status >= 200 && status < 300) {
            try {
                var converted = objectMapper.readValue(body, DocumentConversionModels.ConvertedDocument.class);
                if (!validSuccess(converted, upload, requestId)) {
                    throw new DocumentConversionException(WORKER_PROTOCOL_ERROR);
                }
                return converted;
            } catch (DocumentConversionException exception) {
                throw exception;
            } catch (RuntimeException exception) {
                throw new DocumentConversionException(WORKER_PROTOCOL_ERROR, exception);
            }
        }

        String workerCode = "";
        try {
            var envelope = objectMapper.readValue(body, DocumentConversionModels.WorkerErrorEnvelope.class);
            workerCode = envelope.error() == null ? "" : envelope.error().code();
        } catch (RuntimeException ignored) {
            // Status mapping below is authoritative when an intermediary returns a non-JSON body.
        }
        throw mapWorkerFailure(status, workerCode);
    }

    private boolean validSuccess(
            DocumentConversionModels.ConvertedDocument converted,
            DocumentConversionModels.ValidatedUpload upload,
            String requestId
    ) {
        return "1.0".equals(converted.schemaVersion())
                && requestId.equals(converted.requestId())
                && converted.markdown() != null
                && converted.source() != null
                && upload.filename().equals(converted.source().filename())
                && upload.extension().equals(converted.source().extension())
                && "application/octet-stream".equals(converted.source().contentType())
                && upload.file().getSize() == converted.source().sizeBytes()
                && converted.metrics() != null
                && converted.metrics().durationMs() >= 0
                && converted.metrics().markdownCharacters() >= 0
                && converted.engine() != null
                && !converted.engine().isBlank();
    }

    private DocumentConversionException mapWorkerFailure(int status, String code) {
        if (status == 413 || "converted_output_too_large".equals(code)) {
            return new DocumentConversionException(OUTPUT_TOO_LARGE);
        }
        if (status == 400 || status == 415) {
            return new DocumentConversionException(UNSUPPORTED_EXTENSION);
        }
        if (status == 422) {
            return new DocumentConversionException(CONVERSION_FAILED);
        }
        if (status == 503) {
            return new DocumentConversionException(WORKER_UNAVAILABLE);
        }
        if (status == 504) {
            return new DocumentConversionException(WORKER_TIMEOUT);
        }
        return new DocumentConversionException(WORKER_PROTOCOL_ERROR);
    }

    private byte[] readLimited(HttpEntity entity) throws IOException {
        if (entity == null) {
            throw new DocumentConversionException(WORKER_PROTOCOL_ERROR);
        }
        var maxBytes = properties.maxResponseSize().toBytes();
        if (entity.getContentLength() > maxBytes) {
            throw new DocumentConversionException(OUTPUT_TOO_LARGE);
        }
        try (var input = entity.getContent(); var output = new ByteArrayOutputStream()) {
            var buffer = new byte[16 * 1024];
            long total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) {
                    throw new DocumentConversionException(OUTPUT_TOO_LARGE);
                }
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private boolean isTimeout(InterruptedIOException exception) {
        return exception instanceof SocketTimeoutException
                || exception.getClass().getSimpleName().toLowerCase().contains("timeout");
    }

    @PreDestroy
    void close() throws IOException {
        client.close();
    }
}
