package com.example.finance.controller;

import com.example.finance.dto.PresignedUrlRequest;
import com.example.finance.dto.PresignedUrlResponse;
import com.example.finance.dto.UploadStatusResponse;
import com.example.finance.service.UploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
//@RestController
//@RequestMapping("/api/upload")
@RequiredArgsConstructor
public class UploadController {

    private final UploadService uploadService;

    /**
     * Presigned URL 생성
     */
    @PostMapping("/presigned-url")
    public ResponseEntity<PresignedUrlResponse> generatePresignedUrl(
            @RequestBody PresignedUrlRequest request) {
        log.info("Generating presigned URL for file: {}, size: {}",
                request.getFileName(), request.getFileSize());

        PresignedUrlResponse response = uploadService.generatePresignedUrl(request);

        return ResponseEntity.ok(response);
    }

    /**
     * 업로드 상태 조회
     */
    @GetMapping("/status/{uploadId}")
    public ResponseEntity<UploadStatusResponse> getUploadStatus(
            @PathVariable String uploadId) {
        log.debug("Getting upload status for uploadId: {}", uploadId);

        UploadStatusResponse response = uploadService.getUploadStatus(uploadId);

        return ResponseEntity.ok(response);
    }

    /**
     * 업로드 이력 조회
     */
    @GetMapping("/history")
    public ResponseEntity<Page<UploadStatusResponse>> getUploadHistory(
            @RequestHeader("X-Session-Id") String sessionId,
            Pageable pageable) {
        log.debug("Getting upload history for sessionId: {}", sessionId);

        Page<UploadStatusResponse> response = uploadService.getUploadHistory(sessionId, pageable);

        return ResponseEntity.ok(response);
    }
}