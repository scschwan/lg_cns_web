package com.example.finance.controller;

import com.example.finance.service.ProjectService;
import com.example.finance.service.S3Service;
import com.example.finance.service.UploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 업로드 컨트롤러
 *
 * Phase 1: 대용량 파일 업로드
 */
@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/upload")
@RequiredArgsConstructor
public class UploadController {

    private final S3Service s3Service;
    private final UploadService uploadService;
    private final ProjectService projectService;

    /**
     * Presigned URL 생성
     *
     * POST /api/projects/{projectId}/upload/presigned-url
     */
    @PostMapping("/presigned-url")
    public ResponseEntity<Map<String, Object>> generatePresignedUrl(
            @PathVariable String projectId,
            @RequestParam String fileName,
            @RequestParam Long fileSize,
            Authentication authentication) {

        String userId = authentication.getName();
        log.info("Presigned URL 생성 요청: projectId={}, fileName={}, fileSize={}",
                projectId, fileName, fileSize);

        // 1. 프로젝트 멤버 권한 확인
        projectService.getProject(projectId); // 프로젝트 존재 여부만 확인

        // 2. 세션 및 업로드 ID 생성
        String sessionId = uploadService.createSession(projectId, userId);
        String uploadId = uploadService.createUploadId();

        // 3. Presigned URL 생성
        String presignedUrl = s3Service.generatePresignedUrl(
                projectId, sessionId, uploadId, fileName);

        // 4. S3 키 생성
        String s3Key = s3Service.buildS3Key(projectId, sessionId, uploadId, fileName);

        // 5. 업로드 세션 저장
        uploadService.saveUploadSession(projectId, sessionId, uploadId,
                s3Key, fileName, fileSize);

        Map<String, Object> response = new HashMap<>();
        response.put("presignedUrl", presignedUrl);
        response.put("uploadId", uploadId);
        response.put("sessionId", sessionId);
        response.put("s3Key", s3Key);
        response.put("expiresIn", 3600); // 1시간

        return ResponseEntity.ok(response);
    }

    /**
     * 업로드 상태 조회
     *
     * GET /api/projects/{projectId}/upload/status/{uploadId}
     */
    @GetMapping("/status/{uploadId}")
    public ResponseEntity<Map<String, Object>> getUploadStatus(
            @PathVariable String projectId,
            @PathVariable String uploadId) {

        log.info("업로드 상태 조회: projectId={}, uploadId={}", projectId, uploadId);

        Map<String, Object> status = uploadService.getUploadStatus(uploadId);

        return ResponseEntity.ok(status);
    }
}