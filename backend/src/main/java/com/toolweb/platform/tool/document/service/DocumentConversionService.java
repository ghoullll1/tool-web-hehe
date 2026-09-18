package com.toolweb.platform.tool.document.service;

import com.toolweb.platform.tool.document.client.DocumentConversionWorker;
import com.toolweb.platform.tool.document.config.DocumentConversionProperties;
import com.toolweb.platform.tool.document.dto.DocumentConversionModels;
import com.toolweb.platform.tool.document.exception.DocumentConversionException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Semaphore;

import static com.toolweb.platform.tool.document.exception.DocumentConversionException.Reason.*;

@Service
public class DocumentConversionService {

    static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            ".csv", ".docx", ".eml", ".htm", ".html", ".json", ".md", ".msg",
            ".pdf", ".pptx", ".rtf", ".txt", ".xls", ".xlsx", ".xml");
    private static final String FALLBACK_FILENAME = "document";
    private static final int MAX_FILENAME_CODE_POINTS = 180;

    private final DocumentConversionWorker worker;
    private final DocumentConversionProperties properties;
    private final Semaphore capacity;

    public DocumentConversionService(
            DocumentConversionWorker worker,
            DocumentConversionProperties properties
    ) {
        this.worker = worker;
        this.properties = properties;
        this.capacity = new Semaphore(properties.maxConcurrentConversions(), true);
    }

    public DocumentConversionModels.ConvertedDocument convert(MultipartFile file, String requestId) {
        var upload = validate(file);
        if (!capacity.tryAcquire()) {
            throw new DocumentConversionException(CAPACITY_EXCEEDED);
        }
        try {
            return worker.convert(upload, requestId);
        } finally {
            capacity.release();
        }
    }

    private DocumentConversionModels.ValidatedUpload validate(MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() <= 0) {
            throw new DocumentConversionException(EMPTY_FILE);
        }
        if (file.getSize() > properties.maxFileSize().toBytes()) {
            throw new DocumentConversionException(FILE_TOO_LARGE);
        }
        var filename = sanitizeFilename(file.getOriginalFilename());
        var extension = extensionOf(filename);
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw new DocumentConversionException(UNSUPPORTED_EXTENSION);
        }
        return new DocumentConversionModels.ValidatedUpload(file, filename, extension);
    }

    private String sanitizeFilename(String candidate) {
        var normalized = candidate == null ? "" : candidate.replace('\\', '/');
        normalized = normalized.substring(normalized.lastIndexOf('/') + 1)
                .replaceAll("[\\p{Cc}\\p{Cf}]", "")
                .strip();
        if (normalized.isEmpty() || normalized.equals(".") || normalized.equals("..")) {
            throw new DocumentConversionException(INVALID_FILENAME);
        }
        var count = normalized.codePointCount(0, normalized.length());
        if (count > MAX_FILENAME_CODE_POINTS) {
            var extension = extensionOf(normalized);
            var extensionPoints = extension.codePointCount(0, extension.length());
            var stem = extension.isEmpty()
                    ? normalized
                    : normalized.substring(0, normalized.length() - extension.length());
            var stemLimit = MAX_FILENAME_CODE_POINTS - extensionPoints;
            if (stemLimit <= 0) {
                throw new DocumentConversionException(INVALID_FILENAME);
            }
            if (stem.codePointCount(0, stem.length()) > stemLimit) {
                stem = stem.substring(0, stem.offsetByCodePoints(0, stemLimit));
            }
            normalized = stem + extension;
        }
        return normalized.isBlank() ? FALLBACK_FILENAME : normalized;
    }

    private String extensionOf(String filename) {
        var separator = filename.lastIndexOf('.');
        if (separator <= 0 || separator == filename.length() - 1) {
            return "";
        }
        return filename.substring(separator).toLowerCase(Locale.ROOT);
    }
}
