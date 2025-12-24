package com.example.finance.controller;

import com.example.finance.model.UploadSession;
import com.example.finance.service.ProjectService;
import com.example.finance.service.S3Service;
import com.example.finance.service.UploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import com.example.finance.security.CurrentUser;  // ⭐ 추가
import com.example.finance.security.UserPrincipal;  // ⭐ 추가

import java.util.HashMap;
import java.util.List;
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
            @CurrentUser UserPrincipal userPrincipal) {  // ⭐ 수정


        String userId = userPrincipal.getId();  // ⭐ ObjectId 사용
        log.info("Presigned URL 생성 요청: projectId={}, fileName={}, fileSize={}, userId={}",
                projectId, fileName, fileSize, userId);

        // 1. 프로젝트 멤버 권한 확인
        projectService.getProject(projectId, userId);

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

    // ⭐⭐⭐ 신규 추가 ⭐⭐⭐
    /**
     * 프로젝트의 업로드된 파일 목록 조회
     *
     * GET /api/projects/{projectId}/upload/files
     */
    @GetMapping("/files")
    public ResponseEntity<List<UploadSession>> getUploadedFiles(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {  // ⭐ 수정

        String userId = userPrincipal.getId();  // ⭐ ObjectId 사용
        log.info("업로드된 파일 목록 조회: projectId={}, userId={}", projectId, userId);


        // 프로젝트 멤버 권한 확인
        projectService.getProject(projectId, userId);

        // 프로젝트의 모든 업로드 파일 조회
        List<UploadSession> files = uploadService.getProjectFiles(projectId);

        return ResponseEntity.ok(files);
    }
}