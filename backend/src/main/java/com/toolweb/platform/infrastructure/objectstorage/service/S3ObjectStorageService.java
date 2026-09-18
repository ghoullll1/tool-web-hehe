package com.toolweb.platform.infrastructure.objectstorage.service;

import com.toolweb.platform.infrastructure.objectstorage.config.ObjectStorageProperties;
import com.toolweb.platform.infrastructure.objectstorage.exception.ObjectStorageException;
import com.toolweb.platform.infrastructure.objectstorage.model.ObjectStorageContent;
import com.toolweb.platform.infrastructure.objectstorage.model.ObjectStorageMetadata;
import org.springframework.core.io.InputStreamSource;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class S3ObjectStorageService implements ObjectStorageService {

    private static final int MAX_OBJECT_PATH_BYTES = 1_024;
    private static final int PAGE_SIZE = 1_000;

    private final S3Client s3Client;
    private final String bucket;
    private final String basePrefix;

    public S3ObjectStorageService(S3Client s3Client, ObjectStorageProperties properties) {
        this.s3Client = s3Client;
        this.bucket = properties.bucket();
        this.basePrefix = properties.basePrefix();
    }

    @Override
    public String resolveObjectPath(String relativePath) {
        var normalizedPath = requireSafePath(relativePath, relativePath != null && relativePath.endsWith("/"));
        return requireSafePath(basePrefix + normalizedPath, normalizedPath.endsWith("/"));
    }

    @Override
    public void putObject(String key, InputStreamSource source, long contentLength, String contentType) {
        if (source == null || contentLength <= 0) {
            throw new ObjectStorageException(ObjectStorageException.Reason.IO_FAILURE);
        }
        var normalizedKey = requireSafePath(key, false);
        try {
            var request = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(normalizedKey)
                    .contentLength(contentLength)
                    .contentType(contentType == null || contentType.isBlank()
                            ? "application/octet-stream"
                            : contentType)
                    .build();
            s3Client.putObject(request, RequestBody.fromContentProvider(
                    () -> {
                        try {
                            return source.getInputStream();
                        } catch (IOException exception) {
                            throw new UncheckedIOException(exception);
                        }
                    },
                    contentLength,
                    request.contentType()));
        } catch (UncheckedIOException exception) {
            throw new ObjectStorageException(ObjectStorageException.Reason.IO_FAILURE, exception.getCause());
        } catch (S3Exception exception) {
            throw mapServiceFailure(exception, false);
        } catch (SdkClientException exception) {
            throw new ObjectStorageException(ObjectStorageException.Reason.UNAVAILABLE, exception);
        }
    }

    @Override
    public ObjectStorageMetadata headObject(String key) {
        var normalizedKey = requireSafePath(key, false);
        try {
            var response = s3Client.headObject(HeadObjectRequest.builder()
                    .bucket(bucket)
                    .key(normalizedKey)
                    .build());
            return new ObjectStorageMetadata(
                    normalizedKey,
                    response.contentLength() == null ? -1 : response.contentLength(),
                    response.contentType(),
                    response.lastModified());
        } catch (S3Exception exception) {
            throw mapServiceFailure(exception, true);
        } catch (SdkClientException exception) {
            throw new ObjectStorageException(ObjectStorageException.Reason.UNAVAILABLE, exception);
        }
    }

    @Override
    public ObjectStorageContent getObject(String key) {
        var normalizedKey = requireSafePath(key, false);
        try {
            var response = s3Client.getObject(GetObjectRequest.builder()
                    .bucket(bucket)
                    .key(normalizedKey)
                    .build());
            var metadata = response.response();
            return new ObjectStorageContent(
                    response,
                    metadata.contentLength() == null ? -1 : metadata.contentLength(),
                    metadata.contentType(),
                    metadata.lastModified());
        } catch (S3Exception exception) {
            throw mapServiceFailure(exception, true);
        } catch (SdkClientException exception) {
            throw new ObjectStorageException(ObjectStorageException.Reason.UNAVAILABLE, exception);
        }
    }

    @Override
    public void deleteObject(String key) {
        var normalizedKey = requireSafePath(key, false);
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucket)
                    .key(normalizedKey)
                    .build());
        } catch (S3Exception exception) {
            throw mapServiceFailure(exception, false);
        } catch (SdkClientException exception) {
            throw new ObjectStorageException(ObjectStorageException.Reason.UNAVAILABLE, exception);
        }
    }

    @Override
    public List<ObjectStorageMetadata> listObjectsModifiedBefore(String prefix, Instant cutoff, int limit) {
        var normalizedPrefix = requireSafePath(prefix, true);
        if (cutoff == null || limit <= 0) {
            return List.of();
        }
        try {
            var matches = new ArrayList<ObjectStorageMetadata>();
            String continuationToken = null;
            do {
                var request = ListObjectsV2Request.builder()
                        .bucket(bucket)
                        .prefix(normalizedPrefix)
                        .maxKeys(PAGE_SIZE)
                        .continuationToken(continuationToken)
                        .build();
                var response = s3Client.listObjectsV2(request);
                for (var object : response.contents()) {
                    if (object.lastModified() != null && object.lastModified().isBefore(cutoff)) {
                        matches.add(new ObjectStorageMetadata(
                                requireSafePath(object.key(), false),
                                object.size() == null ? -1 : object.size(),
                                null,
                                object.lastModified()));
                    }
                }
                continuationToken = Boolean.TRUE.equals(response.isTruncated())
                        ? response.nextContinuationToken()
                        : null;
            } while (continuationToken != null && !continuationToken.isBlank());

            return matches.stream()
                    .sorted(Comparator.comparing(ObjectStorageMetadata::lastModified)
                            .thenComparing(ObjectStorageMetadata::key))
                    .limit(limit)
                    .toList();
        } catch (S3Exception exception) {
            throw mapServiceFailure(exception, false);
        } catch (SdkClientException exception) {
            throw new ObjectStorageException(ObjectStorageException.Reason.UNAVAILABLE, exception);
        }
    }

    private String requireSafePath(String key, boolean allowTrailingSlash) {
        if (key == null) {
            throw new ObjectStorageException(ObjectStorageException.Reason.INVALID_KEY);
        }
        var normalized = key.strip().replace('\\', '/');
        var candidate = allowTrailingSlash && normalized.endsWith("/")
                ? normalized.substring(0, normalized.length() - 1)
                : normalized;
        if (candidate.isBlank()
                || candidate.startsWith("/")
                || candidate.contains("//")
                || normalized.getBytes(StandardCharsets.UTF_8).length > MAX_OBJECT_PATH_BYTES
                || normalized.codePoints().anyMatch(Character::isISOControl)
                || java.util.Arrays.stream(candidate.split("/", -1))
                        .anyMatch(segment -> segment.isBlank() || segment.equals(".") || segment.equals(".."))) {
            throw new ObjectStorageException(ObjectStorageException.Reason.INVALID_KEY);
        }
        return allowTrailingSlash && normalized.endsWith("/") ? candidate + "/" : candidate;
    }

    private ObjectStorageException mapServiceFailure(S3Exception exception, boolean missingIsExpected) {
        var status = exception.statusCode();
        if (missingIsExpected && status == 404) {
            return new ObjectStorageException(ObjectStorageException.Reason.NOT_FOUND, exception);
        }
        if (status == 401 || status == 403) {
            return new ObjectStorageException(ObjectStorageException.Reason.ACCESS_DENIED, exception);
        }
        return new ObjectStorageException(ObjectStorageException.Reason.UNAVAILABLE, exception);
    }
}
