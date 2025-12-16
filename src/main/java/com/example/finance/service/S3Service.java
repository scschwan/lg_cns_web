package com.example.finance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.time.Duration;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class S3Service {

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;

    @Value("${aws.s3.excel-bucket}")
    private String excelBucket;

    /**
     * Presigned URL 생성
     */
    /**
     * Presigned URL 생성 (메타데이터 제거 버전)
     */
    public PresignedUrlResult generatePresignedUrl(String sessionId, String fileName, Long fileSize) {
        String uploadId = UUID.randomUUID().toString();
        String s3Key = String.format("uploads/%s/%s/%s", sessionId, uploadId, fileName);

        // PutObjectRequest 생성 (메타데이터 제거!)
        PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                .bucket(excelBucket)
                .key(s3Key)
                // ✅ contentType도 제거 (가장 단순하게)
                .build();

        // Presigned URL 생성 (1시간 유효)
        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .putObjectRequest(putObjectRequest)
                .signatureDuration(Duration.ofHours(1))
                .build();

        PresignedPutObjectRequest presignedRequest = s3Presigner.presignPutObject(presignRequest);

        log.info("Generated presigned URL for uploadId: {}, s3Key: {}", uploadId, s3Key);

        return PresignedUrlResult.builder()
                .uploadId(uploadId)
                .presignedUrl(presignedRequest.url().toString())
                .s3Bucket(excelBucket)
                .s3Key(s3Key)
                .expiresIn(3600L)
                .build();
    }

    @lombok.Data
    @lombok.Builder
    public static class PresignedUrlResult {
        private String uploadId;
        private String presignedUrl;
        private String s3Bucket;
        private String s3Key;
        private Long expiresIn;
    }
}