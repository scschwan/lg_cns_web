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

/**
 * S3 서비스
 *
 * Phase 1: 대용량 파일 업로드
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class S3Service {

    private final S3Client s3Client;

    @Value("${aws.s3.excel-bucket}")
    private String excelBucket;

    @Value("${aws.region}")
    private String region;

    /**
     * Presigned URL 생성 (projectId 포함)
     *
     * @param projectId 프로젝트 ID
     * @param sessionId 세션 ID
     * @param uploadId 업로드 ID
     * @param fileName 파일명
     * @return Presigned URL
     */
    public String generatePresignedUrl(String projectId, String sessionId,
                                       String uploadId, String fileName) {

        // S3 키: projects/{projectId}/sessions/{sessionId}/uploads/{uploadId}/{fileName}
        String s3Key = String.format("projects/%s/sessions/%s/uploads/%s/%s",
                projectId, sessionId, uploadId, fileName);

        log.info("Presigned URL 생성: bucket={}, key={}", excelBucket, s3Key);

        try (S3Presigner presigner = S3Presigner.builder()
                .region(software.amazon.awssdk.regions.Region.of(region))
                .build()) {

            PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                    .bucket(excelBucket)
                    .key(s3Key)
                    .build();

            PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                    .signatureDuration(Duration.ofHours(1))
                    .putObjectRequest(putObjectRequest)
                    .build();

            PresignedPutObjectRequest presignedRequest = presigner.presignPutObject(presignRequest);

            String url = presignedRequest.url().toString();
            log.info("Presigned URL 생성 완료: {}", url);

            return url;
        }
    }

    /**
     * S3 키 생성
     *
     * @param projectId 프로젝트 ID
     * @param sessionId 세션 ID
     * @param uploadId 업로드 ID
     * @param fileName 파일명
     * @return S3 키
     */
    public String buildS3Key(String projectId, String sessionId,
                             String uploadId, String fileName) {
        return String.format("projects/%s/sessions/%s/uploads/%s/%s",
                projectId, sessionId, uploadId, fileName);
    }
}