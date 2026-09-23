package com.toolweb.platform.tool.fileshare.controller;

import com.toolweb.platform.tool.fileshare.dto.TemporaryFileShareModels;
import com.toolweb.platform.tool.fileshare.service.TemporaryFileShareService;
import com.toolweb.platform.tool.fileshare.service.PickupAttemptLimiter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/v1/file-shares")
public class TemporaryFileShareController {

    static final String FILE_SHA256_HEADER = "X-File-Sha256";

    private static final Logger log = LoggerFactory.getLogger(TemporaryFileShareController.class);

    private final TemporaryFileShareService service;
    private final PickupAttemptLimiter limiter;

    public TemporaryFileShareController(TemporaryFileShareService service, PickupAttemptLimiter limiter) {
        this.service = service;
        this.limiter = limiter;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<TemporaryFileShareModels.CreatedShare> create(
            @RequestPart("file") MultipartFile file,
            HttpServletRequest request
    ) {
        var created = service.create(file);
        log.info("Temporary file share created sizeBytes={} requestId={}",
                created.sizeBytes(), request.getAttribute("requestId"));
        return ResponseEntity.status(201)
                .cacheControl(CacheControl.noStore())
                .body(created);
    }

    @PostMapping(path = "/download", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    ResponseEntity<org.springframework.core.io.Resource> download(
            @RequestBody TemporaryFileShareModels.PickupRequest pickup,
            HttpServletRequest request
    ) {
        // Never trust caller-supplied X-Forwarded-For here; the trusted reverse proxy owns forwarding.
        limiter.check(request.getRemoteAddr());
        var grant = service.authorizeDownload(pickup.pickupCode());
        log.info("Temporary file share download authorized sizeBytes={} requestId={}",
                grant.sizeBytes(), request.getAttribute("requestId"));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(grant.sizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(grant.originalFilename(), StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "sandbox")
                .header(FILE_SHA256_HEADER, grant.sha256())
                .body(grant.resource());
    }
}
