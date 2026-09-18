package com.toolweb.platform.infrastructure.objectstorage.service;

import com.toolweb.platform.infrastructure.objectstorage.config.ObjectStorageProperties;
import com.toolweb.platform.infrastructure.objectstorage.exception.ObjectStorageException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.io.ByteArrayResource;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.S3Object;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class S3ObjectStorageServiceTest {

    private S3Client s3Client;
    private S3ObjectStorageService service;

    @BeforeEach
    void setUp() {
        s3Client = mock(S3Client.class);
        service = new S3ObjectStorageService(s3Client, new ObjectStorageProperties(
                URI.create("http://127.0.0.1:9000"), "us-east-1", "bucket", "tool-web/",
                "access", "secret", true, null, null, null, null, 8));
    }

    @Test
    void appliesTheConfiguredBucketAndPrefixWhenUploading() {
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenReturn(PutObjectResponse.builder().build());

        var objectPath = service.resolveObjectPath("temporary/报告.txt");
        service.putObject(objectPath, new ByteArrayResource("hello".getBytes()), 5, "text/plain");

        var request = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(request.capture(), any(RequestBody.class));
        assertThat(request.getValue().bucket()).isEqualTo("bucket");
        assertThat(objectPath).isEqualTo("tool-web/temporary/报告.txt");
        assertThat(request.getValue().key()).isEqualTo(objectPath);
        assertThat(request.getValue().contentLength()).isEqualTo(5);
        assertThat(request.getValue().contentType()).isEqualTo("text/plain");
    }

    @Test
    void streamsDownloadsAndKeepsSdkTypesBehindTheServiceBoundary() throws Exception {
        var sdkStream = new ResponseInputStream<>(
                GetObjectResponse.builder()
                        .contentLength(5L)
                        .contentType("text/plain")
                        .lastModified(Instant.parse("2026-09-18T00:00:00Z"))
                        .build(),
                AbortableInputStream.create(new ByteArrayInputStream("hello".getBytes())));
        when(s3Client.getObject(any(software.amazon.awssdk.services.s3.model.GetObjectRequest.class)))
                .thenReturn(sdkStream);

        try (var content = service.getObject("tool-web/temporary/file.txt")) {
            assertThat(content.inputStream().readAllBytes()).isEqualTo("hello".getBytes());
            assertThat(content.contentLength()).isEqualTo(5);
            assertThat(content.contentType()).isEqualTo("text/plain");
        }
    }

    @Test
    void scansAllPagesAndReturnsTheOldestMatchingLogicalKeys() {
        var cutoff = Instant.parse("2026-09-18T02:00:00Z");
        when(s3Client.listObjectsV2(any(software.amazon.awssdk.services.s3.model.ListObjectsV2Request.class)))
                .thenReturn(
                        ListObjectsV2Response.builder()
                                .isTruncated(true)
                                .nextContinuationToken("next")
                                .contents(object("tool-web/temporary/new", "2026-09-18T03:00:00Z"))
                                .build(),
                        ListObjectsV2Response.builder()
                                .isTruncated(false)
                                .contents(
                                        object("tool-web/temporary/older", "2026-09-18T00:00:00Z"),
                                        object("tool-web/temporary/old", "2026-09-18T01:00:00Z"))
                                .build());

        assertThat(service.listObjectsModifiedBefore("tool-web/temporary/", cutoff, 1))
                .extracting(metadata -> metadata.key())
                .containsExactly("tool-web/temporary/older");
    }

    @Test
    void mapsMissingObjectsAndRejectsEscapingKeys() {
        when(s3Client.headObject(any(software.amazon.awssdk.services.s3.model.HeadObjectRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(404).message("missing").build());

        assertThatThrownBy(() -> service.headObject("tool-web/temporary/missing"))
                .isInstanceOfSatisfying(ObjectStorageException.class,
                        exception -> assertThat(exception.reason()).isEqualTo(ObjectStorageException.Reason.NOT_FOUND));
        assertThatThrownBy(() -> service.deleteObject("../outside"))
                .isInstanceOfSatisfying(ObjectStorageException.class,
                        exception -> assertThat(exception.reason()).isEqualTo(ObjectStorageException.Reason.INVALID_KEY));
    }

    @Test
    void returnsHeadMetadataWithoutOpeningTheObjectStream() {
        when(s3Client.headObject(any(software.amazon.awssdk.services.s3.model.HeadObjectRequest.class)))
                .thenReturn(HeadObjectResponse.builder().contentLength(12L).contentType("text/plain").build());

        assertThat(service.headObject("tool-web/temporary/file.txt").contentLength()).isEqualTo(12);
    }

    private S3Object object(String key, String modifiedAt) {
        return S3Object.builder().key(key).size(1L).lastModified(Instant.parse(modifiedAt)).build();
    }
}
