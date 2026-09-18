package com.toolweb.platform.infrastructure.objectstorage.config;

import com.toolweb.platform.infrastructure.objectstorage.service.ObjectStorageService;
import com.toolweb.platform.infrastructure.objectstorage.service.S3ObjectStorageService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.http.apache5.Apache5HttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(
        prefix = "tool-platform.temporary-file-share",
        name = "storage-provider",
        havingValue = "rustfs")
public class S3ObjectStorageConfiguration {

    @Bean(destroyMethod = "close")
    S3Client rustFsS3Client(ObjectStorageProperties properties) {
        properties.validateForS3();
        var httpClient = Apache5HttpClient.builder()
                .connectionTimeout(properties.connectTimeout())
                .socketTimeout(properties.socketTimeout())
                .connectionAcquisitionTimeout(properties.connectionAcquireTimeout())
                .maxConnections(properties.maxConnections());
        return S3Client.builder()
                .endpointOverride(properties.endpoint())
                .region(Region.of(properties.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(properties.accessKey(), properties.secretKey())))
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(properties.pathStyleAccess())
                        .build())
                .overrideConfiguration(ClientOverrideConfiguration.builder()
                        .apiCallTimeout(properties.apiCallTimeout())
                        .build())
                .httpClientBuilder(httpClient)
                .build();
    }

    @Bean
    ObjectStorageService objectStorageService(S3Client rustFsS3Client, ObjectStorageProperties properties) {
        return new S3ObjectStorageService(rustFsS3Client, properties);
    }
}
