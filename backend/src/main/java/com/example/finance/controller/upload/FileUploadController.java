// backend/src/main/java/com/example/finance/controller/FileUploadController.java

package com.example.finance.controller;

import com.example.finance.dto.*;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.FileUploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/files")
@RequiredArgsConstructor
public class FileUploadController {

    private final FileUploadService fileUploadService;

    /**
     * Presigned URL 생성
     */
    @PostMapping("/presigned-url")
    public ResponseEntity<Map<String, Object>> generatePresignedUrl(
            @PathVariable String projectId,
            @RequestBody PresignedUrlRequest request,
            @CurrentUser UserPrincipal userPrincipal) {

        log.info("Presigned URL 요청: projectId={}, fileName={}", projectId, request.getFileName());

        Map<String, Object> result = fileUploadService.generatePresignedUrl(
                projectId,
                userPrincipal.getId(),
                request
        );

        return ResponseEntity.ok(result);
    }

    /**
     * 업로드 완료 알림
     */
    @PostMapping("/{fileId}/complete")
    public ResponseEntity<Void> completeUpload(
            @PathVariable String projectId,
            @PathVariable String fileId,
            @RequestBody Map<String, String> request) {

        String uploadId = request.get("uploadId");
        log.info("업로드 완료: projectId={}, fileId={}, uploadId={}", projectId, fileId, uploadId);

        fileUploadService.completeUpload(projectId, fileId, uploadId);

        return ResponseEntity.ok().build();
    }

    /**
     * 파일 목록 조회
     */
    @GetMapping
    public ResponseEntity<List<FileMetadata>> getFiles(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {

        List<FileMetadata> files = fileUploadService.getFiles(projectId, userPrincipal.getId());
        return ResponseEntity.ok(files);
    }

    /**
     * 파일 컬럼 업데이트
     */
    @PutMapping("/{fileId}/columns")
    public ResponseEntity<FileMetadata> updateFileColumns(
            @PathVariable String projectId,
            @PathVariable String fileId,
            @RequestBody Map<String, String> columns) {

        log.info("파일 컬럼 업데이트: fileId={}, columns={}", fileId, columns);

        FileMetadata updated = fileUploadService.updateFileColumns(projectId, fileId, columns);
        return ResponseEntity.ok(updated);
    }

    /**
     * 계정명 추출
     */
    @PostMapping("/{fileId}/extract-accounts")
    public ResponseEntity<Map<String, List<String>>> extractAccountValues(
            @PathVariable String projectId,
            @PathVariable String fileId,
            @RequestBody Map<String, String> request) {

        String columnName = request.get("columnName");
        log.info("계정명 추출: fileId={}, columnName={}", fileId, columnName);

        List<String> accounts = fileUploadService.extractAccountValues(projectId, fileId, columnName);
        return ResponseEntity.ok(Map.of("accounts", accounts));
    }

    /**
     * 금액 합산
     */
    @PostMapping("/{fileId}/calculate-amount")
    public ResponseEntity<Map<String, Double>> calculateTotalAmount(
            @PathVariable String projectId,
            @PathVariable String fileId,
            @RequestBody Map<String, String> request) {

        String columnName = request.get("columnName");
        log.info("금액 합산: fileId={}, columnName={}", fileId, columnName);

        Double totalAmount = fileUploadService.calculateTotalAmount(projectId, fileId, columnName);
        return ResponseEntity.ok(Map.of("totalAmount", totalAmount));
    }

    /**
     * 파일 삭제
     */
    @DeleteMapping("/{fileId}")
    public ResponseEntity<Void> deleteFile(
            @PathVariable String projectId,
            @PathVariable String fileId) {

        log.info("파일 삭제: projectId={}, fileId={}", projectId, fileId);
        fileUploadService.deleteFile(projectId, fileId);

        return ResponseEntity.ok().build();
    }
}