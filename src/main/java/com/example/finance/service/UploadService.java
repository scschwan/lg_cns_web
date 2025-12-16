package com.example.finance.service;

import com.example.finance.dto.PresignedUrlRequest;
import com.example.finance.dto.PresignedUrlResponse;
import com.example.finance.dto.UploadStatusResponse;
import com.example.finance.model.UploadSession;
import com.example.finance.repository.UploadSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class UploadService {

    private final S3Service s3Service;
    private final UploadSessionRepository uploadSessionRepository;
    private final RedisService redisService;

    /**
     * Presigned URL 생성
     */
    @Transactional
    public PresignedUrlResponse generatePresignedUrl(PresignedUrlRequest request) {
        // S3 Presigned URL 생성
        S3Service.PresignedUrlResult s3Result = s3Service.generatePresignedUrl(
                request.getSessionId(),
                request.getFileName(),
                request.getFileSize()
        );

        // UploadSession 생성
        UploadSession session = UploadSession.builder()
                .sessionId(request.getSessionId())
                .uploadId(s3Result.getUploadId())
                .fileName(request.getFileName())
                .fileSize(request.getFileSize())
                .s3Bucket(s3Result.getS3Bucket())
                .s3Key(s3Result.getS3Key())
                .status(UploadSession.UploadStatus.PENDING)
                .progress(0)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        uploadSessionRepository.save(session);

        // Redis에 초기 상태 저장
        redisService.saveUploadProgress(s3Result.getUploadId(), 0);

        log.info("Created upload session: uploadId={}, fileName={}",
                s3Result.getUploadId(), request.getFileName());

        return PresignedUrlResponse.builder()
                .uploadId(s3Result.getUploadId())
                .presignedUrl(s3Result.getPresignedUrl())
                .s3Bucket(s3Result.getS3Bucket())
                .s3Key(s3Result.getS3Key())
                .expiresIn(s3Result.getExpiresIn())
                .build();
    }

    /**
     * 업로드 상태 조회
     */
    public UploadStatusResponse getUploadStatus(String uploadId) {
        UploadSession session = uploadSessionRepository.findByUploadId(uploadId)
                .orElseThrow(() -> new RuntimeException("Upload session not found: " + uploadId));

        return UploadStatusResponse.builder()
                .uploadId(session.getUploadId())
                .fileName(session.getFileName())
                .status(session.getStatus())
                .progress(session.getProgress())
                .totalRows(session.getTotalRows())
                .processedRows(session.getProcessedRows())
                .errorMessage(session.getErrorMessage())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .completedAt(session.getCompletedAt())
                .build();
    }

    /**
     * 업로드 이력 조회
     */
    public Page<UploadStatusResponse> getUploadHistory(String sessionId, Pageable pageable) {
        Page<UploadSession> sessions = uploadSessionRepository.findBySessionId(sessionId, pageable);

        return sessions.map(session -> UploadStatusResponse.builder()
                .uploadId(session.getUploadId())
                .fileName(session.getFileName())
                .status(session.getStatus())
                .progress(session.getProgress())
                .totalRows(session.getTotalRows())
                .processedRows(session.getProcessedRows())
                .errorMessage(session.getErrorMessage())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .completedAt(session.getCompletedAt())
                .build());
    }

    /**
     * S3 업로드 완료 처리
     */
    @Transactional
    public void completeUpload(String uploadId) {
        UploadSession session = uploadSessionRepository.findByUploadId(uploadId)
                .orElseThrow(() -> new RuntimeException("Upload session not found: " + uploadId));

        // 상태 업데이트: UPLOADED
        session.setStatus(UploadSession.UploadStatus.UPLOADED);
        session.setUpdatedAt(LocalDateTime.now());
        uploadSessionRepository.save(session);

        // Redis 진행률 업데이트
        redisService.hSet("upload:progress:" + uploadId, "status", "UPLOADED");
        redisService.hSet("upload:progress:" + uploadId, "updatedAt", System.currentTimeMillis());

        log.info("Upload completed: uploadId={}", uploadId);
    }
}