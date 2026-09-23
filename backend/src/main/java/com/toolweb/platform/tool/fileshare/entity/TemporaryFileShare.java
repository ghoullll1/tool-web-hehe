package com.toolweb.platform.tool.fileshare.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;

import java.time.Instant;
import java.util.Objects;

@TableName("temporary_file_share")
public class TemporaryFileShare {

    public enum Status {
        ACTIVE,
        CONSUMED
    }

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String shareId;

    private String accessKeyDigest;

    private String pickupCodeDigest;

    private String objectKey;

    private String objectPath;

    private String originalFilename;

    private String contentType;

    private long sizeBytes;

    private String sha256;

    private Instant expiresAt;

    private int downloadCount;

    private int maxDownloads;

    private Status status;

    private Instant createdAt;

    private Instant consumedAt;

    @TableLogic(value = "0", delval = "1")
    private boolean deleted;

    private Instant deletedAt;

    @Version
    private long version;

    protected TemporaryFileShare() {
    }

    public static TemporaryFileShare create(
            String shareId,
            String accessKeyDigest,
            String objectKey,
            String objectPath,
            String originalFilename,
            String contentType,
            long sizeBytes,
            String sha256,
            Instant createdAt,
            Instant expiresAt,
            int maxDownloads
    ) {
        var share = new TemporaryFileShare();
        share.shareId = shareId;
        share.accessKeyDigest = accessKeyDigest;
        share.objectKey = objectKey;
        share.objectPath = objectPath;
        share.originalFilename = originalFilename;
        share.contentType = contentType;
        share.sizeBytes = sizeBytes;
        share.sha256 = sha256;
        share.createdAt = createdAt;
        share.expiresAt = expiresAt;
        share.maxDownloads = maxDownloads;
        share.downloadCount = 0;
        share.status = Status.ACTIVE;
        share.deleted = false;
        return share;
    }

    public void consume(Instant consumedAt) {
        downloadCount++;
        this.consumedAt = consumedAt;
        if (downloadCount >= maxDownloads) {
            status = Status.CONSUMED;
        }
    }

    public void markDeleted(Instant deletedAt) {
        var deletionTime = Objects.requireNonNull(deletedAt, "deletedAt");
        if (!deleted) {
            deleted = true;
            this.deletedAt = deletionTime;
        }
    }

    public Long id() { return id; }
    public String shareId() { return shareId; }
    public String accessKeyDigest() { return accessKeyDigest; }
    public String pickupCodeDigest() { return pickupCodeDigest; }
    public void assignPickupCodeDigest(String digest) { pickupCodeDigest = Objects.requireNonNull(digest); }
    public String objectKey() { return objectKey; }
    public String objectPath() { return objectPath; }
    public String storagePath() { return objectPath == null || objectPath.isBlank() ? objectKey : objectPath; }
    public String originalFilename() { return originalFilename; }
    public String contentType() { return contentType; }
    public long sizeBytes() { return sizeBytes; }
    public String sha256() { return sha256; }
    public Instant expiresAt() { return expiresAt; }
    public int downloadCount() { return downloadCount; }
    public int maxDownloads() { return maxDownloads; }
    public Status status() { return status; }
    public boolean deleted() { return deleted; }
    public Instant deletedAt() { return deletedAt; }
    public long version() { return version; }
}
