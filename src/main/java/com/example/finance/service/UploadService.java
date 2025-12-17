package com.example.finance.service;

import com.example.finance.model.UploadSession;
import com.example.finance.repository.UploadSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 업로드 서비스
 *
 * Phase 1: 대용량 파일 업로드
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UploadService {

    private final UploadSessionRepository uploadSessionRepository;
    private final RedisService redisService;

    @Value("${aws.s3.excel-bucket}")
    private String excelBucket;

    /**
     * 세션 생성
     */
    public String createSession(String projectId, String userId) {
        String sessionId = "session-" + UUID.randomUUID().toString();
        log.info("세션 생성: projectId={}, sessionId={}", projectId, sessionId);
        return sessionId;
    }

    /**
     * 업로드 ID 생성
     */
    public String createUploadId() {
        return "upload-" + UUID.randomUUID().toString();
    }

    /**
     * 업로드 세션 저장
     */
    public void saveUploadSession(String projectId, String sessionId, String uploadId,
                                  String s3Key, String fileName, Long fileSize) {

        UploadSession session = UploadSession.builder()
                .projectId(projectId)
                .sessionId(sessionId)
                .uploadId(uploadId)
                .s3Bucket(excelBucket)
                .s3Key(s3Key)
                .fileName(fileName)
                .fileSize(fileSize)
                .status(UploadSession.UploadStatus.PENDING)
                .progress(0)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        uploadSessionRepository.save(session);

        // Redis 초기화
        redisService.hSet("upload:status:" + uploadId, "status", "PENDING");
        redisService.hSet("upload:status:" + uploadId, "progress", 0);

        log.info("업로드 세션 저장 완료: uploadId={}", uploadId);
    }

    /**
     * 업로드 상태 조회
     */
    public Map<String, Object> getUploadStatus(String uploadId) {
        Map<String, Object> status = new HashMap<>();

        // Redis에서 조회
        Object statusValue = redisService.hGet("upload:status:" + uploadId, "status");
        Object progressValue = redisService.hGet("upload:status:" + uploadId, "progress");
        Object totalRowsValue = redisService.hGet("upload:status:" + uploadId, "totalRows");
        Object processedRowsValue = redisService.hGet("upload:status:" + uploadId, "processedRows");

        status.put("uploadId", uploadId);
        status.put("status", statusValue != null ? statusValue : "UNKNOWN");
        status.put("progress", progressValue != null ? progressValue : 0);
        status.put("totalRows", totalRowsValue);
        status.put("processedRows", processedRowsValue);

        return status;
    }
}