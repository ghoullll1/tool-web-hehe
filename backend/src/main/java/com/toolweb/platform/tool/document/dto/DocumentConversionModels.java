package com.toolweb.platform.tool.document.dto;

import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

public final class DocumentConversionModels {

    private DocumentConversionModels() {
    }

    public record ValidatedUpload(MultipartFile file, String filename, String extension) {
    }

    public record ConvertedDocument(
            String schemaVersion,
            String requestId,
            String title,
            String markdown,
            Source source,
            String engine,
            String engineVersion,
            Metrics metrics,
            List<String> warnings
    ) {
        public ConvertedDocument {
            warnings = warnings == null ? List.of() : List.copyOf(warnings);
        }
    }

    public record Source(String filename, String extension, String contentType, long sizeBytes) {
    }

    public record Metrics(long durationMs, long markdownCharacters) {
    }

    public record WorkerErrorEnvelope(WorkerError error) {
    }

    public record WorkerError(String code, String message, String requestId, Map<String, Object> details) {
    }
}
