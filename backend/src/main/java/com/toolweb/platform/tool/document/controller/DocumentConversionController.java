package com.toolweb.platform.tool.document.controller;

import com.toolweb.platform.tool.document.dto.DocumentConversionModels;
import com.toolweb.platform.tool.document.service.DocumentConversionService;
import com.toolweb.platform.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/document-conversions")
public class DocumentConversionController {

    private static final Logger log = LoggerFactory.getLogger(DocumentConversionController.class);

    private final DocumentConversionService service;

    public DocumentConversionController(DocumentConversionService service) {
        this.service = service;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<DocumentConversionModels.ConvertedDocument> convert(
            @RequestPart("file") MultipartFile file,
            HttpServletRequest request
    ) {
        var requestId = String.valueOf(request.getAttribute(RequestIdFilter.ATTRIBUTE_NAME));
        var converted = service.convert(file, requestId);
        log.info("Document converted extension={} sizeBytes={} durationMs={} requestId={}",
                converted.source().extension(), converted.source().sizeBytes(),
                converted.metrics().durationMs(), requestId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(converted);
    }
}
