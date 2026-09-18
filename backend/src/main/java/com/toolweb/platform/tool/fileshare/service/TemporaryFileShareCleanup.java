package com.toolweb.platform.tool.fileshare.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class TemporaryFileShareCleanup {

    private static final Logger log = LoggerFactory.getLogger(TemporaryFileShareCleanup.class);

    private final TemporaryFileShareService service;

    public TemporaryFileShareCleanup(TemporaryFileShareService service) {
        this.service = service;
    }

    @Scheduled(fixedDelayString = "${tool-platform.temporary-file-share.cleanup-interval:30s}")
    void cleanup() {
        var deleted = service.cleanupExpired();
        if (deleted > 0) {
            log.info("Removed {} expired temporary file shares", deleted);
        }
    }
}
