package com.toolweb.platform.tool.fileshare.dto;

import org.springframework.core.io.Resource;

import java.time.Instant;

public final class TemporaryFileShareModels {

    private TemporaryFileShareModels() {
    }

    public record CreatedShare(
            String pickupCode,
            String originalFilename,
            long sizeBytes,
            String sha256,
            Instant expiresAt,
            Instant serverTime,
            int maxDownloads
    ) {
    }

    public record PickupRequest(String pickupCode) {
    }

    public record DownloadGrant(
            Resource resource,
            String originalFilename,
            long sizeBytes,
            String sha256
    ) {
    }
}
