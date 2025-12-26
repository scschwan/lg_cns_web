package com.example.finance.controller.upload;

import com.example.finance.dto.request.upload.PresignedUrlRequest;
import com.example.finance.dto.request.upload.SetFileColumnsRequest;
import com.example.finance.dto.request.upload.UploadFileRequest;
import com.example.finance.dto.response.upload.AccountPartitionResponse;
import com.example.finance.dto.response.upload.PartitionAnalysisResponse;
import com.example.finance.dto.response.upload.PresignedUrlResponse;
import com.example.finance.dto.response.upload.UploadFileResponse;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.service.common.S3Service;
import com.example.finance.service.project.ProjectService;
import com.example.finance.service.upload.FileAnalysisService;
import com.example.finance.service.upload.UploadService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import com.example.finance.security.UserPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 업로드 컨트롤러
 *
 * Step 1: Multi File Upload - 파일 업로드 관리
 *
 * Base Path: /api/projects/{projectId}/upload
 */
@Tag(name = "Upload", description = "파일 업로드 API")
@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/upload")
@RequiredArgsConstructor
public class UploadController {

    private final S3Service s3Service;
    private final UploadService uploadService;
    private final FileAnalysisService fileAnalysisService;
    private final ProjectService projectService;

    /**
     * Presigned URL 생성
     *
     * POST /api/projects/{projectId}/upload/presigned-url
     */
    // ===== createPresignedUrl 메서드 전체 수정 =====
    @Operation(summary = "Presigned URL 생성", description = "S3 직접 업로드를 위한 Presigned URL 생성")
    @PostMapping("/presigned-url")
    public ResponseEntity<PresignedUrlResponse> createPresignedUrl(
            @PathVariable String projectId,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            @Valid @RequestBody PresignedUrlRequest request) {

        String userId = userPrincipal.getId();
        log.info("Presigned URL 생성 요청: projectId={}, userId={}, fileName={}",
                projectId, userId, request.getFileName());

        // 1. 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // 2. 세션 ID와 업로드 ID 생성
        String sessionId = uploadService.createSession(projectId, userId);
        String uploadId = uploadService.createUploadId();

        // 3. S3 키 생성
        String s3Key = s3Service.buildS3Key(projectId, sessionId, uploadId, request.getFileName());

        // 4. Presigned URL 생성
        String presignedUrl = s3Service.generatePresignedUrl(
                projectId,
                sessionId,
                uploadId,
                request.getFileName()
        );

        // 5. Redis에 업로드 세션 초기화
        uploadService.saveUploadSession(
                projectId,
                sessionId,
                uploadId,
                s3Key,
                request.getFileName(),
                request.getFileSize()
        );

        // 6. 응답 생성
        PresignedUrlResponse response = PresignedUrlResponse.builder()
                .presignedUrl(presignedUrl)
                .uploadId(uploadId)
                .sessionId(sessionId)  // ⭐ 추가!
                .s3Key(s3Key)
                .expiresIn(3600L)
                .build();

        log.info("Presigned URL 생성 완료: uploadId={}, sessionId={}", uploadId, sessionId);

        return ResponseEntity.ok(response);
    }

    /**
     * 업로드 상태 조회
     *
     * GET /api/projects/{projectId}/upload/status/{uploadId}
     */
    @Operation(summary = "업로드 상태 조회", description = "Lambda 파싱 진행률 조회")
    @GetMapping("/status/{uploadId}")
    public ResponseEntity<Map<String, Object>> getUploadStatus(
            @PathVariable String projectId,
            @PathVariable String uploadId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("업로드 상태 조회: projectId={}, userId ={} , uploadId={}", projectId, userId,uploadId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // Redis에서 상태 조회
        Map<String, Object> status = uploadService.getUploadStatus(uploadId);

        return ResponseEntity.ok(status);
    }

    /**
     * 프로젝트 파일 목록 조회
     *
     * GET /api/projects/{projectId}/upload/files
     */
    @Operation(summary = "프로젝트 파일 목록", description = "프로젝트에 업로드된 모든 파일 조회")
    @GetMapping("/files")
    public ResponseEntity<List<UploadedFileInfo>> getProjectFiles(
            @PathVariable String projectId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("프로젝트 파일 목록 조회: projectId={} , userId = {}", projectId ,userId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // 파일 목록 조회
        List<UploadedFileInfo> files = uploadService.getProjectFiles(projectId);

        return ResponseEntity.ok(files);
    }

    // ⭐⭐⭐ 신규 API 엔드포인트 ⭐⭐⭐

    /**
     * 파일 업로드 완료 처리
     *
     * POST /api/projects/{projectId}/upload/files
     *
     * S3 업로드 완료 후 Backend에 파일 메타데이터 저장
     */
    @Operation(summary = "파일 업로드 완료", description = "S3 업로드 완료 후 메타데이터 저장")
    @PostMapping("/files")
    public ResponseEntity<UploadFileResponse> completeFileUpload(
            @PathVariable String projectId,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            @Valid @RequestBody UploadFileRequest request) {

        String userId = userPrincipal.getId();
        log.info("파일 업로드 완료: projectId={}, userId = {} ,fileName={}", projectId, userId,request.getFileName());

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // 파일 업로드 완료 처리
        UploadFileResponse response = uploadService.completeFileUpload(projectId, userId, request);

        return ResponseEntity.ok(response);
    }

    /**
     * 파일 분석 (계정명 추출, 파티션 제안)
     *
     * POST /api/projects/{projectId}/upload/analyze
     *
     * 업로드된 파일들의 계정명을 분석하여 세션 파티션 제안
     */
    @Operation(summary = "파일 분석", description = "계정명 추출 및 파티션 제안")
    @PostMapping("/analyze")
    public ResponseEntity<List<AccountPartitionResponse>> analyzeFiles(
            @PathVariable String projectId,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            @RequestBody Map<String, List<String>> request) {

        String userId = userPrincipal.getId();
        List<String> fileIds = request.get("fileIds");

        log.info("파일 분석 요청: projectId={}, userId ={}, fileIds={}", projectId, userId, fileIds);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // 파일 분석 및 파티션 생성
        List<AccountPartitionResponse> partitions =
                fileAnalysisService.analyzeFilesAndCreatePartitions(projectId, fileIds);

        log.info("파일 분석 완료: {} 개 파티션 생성", partitions.size());

        return ResponseEntity.ok(partitions);
    }

    /**
     * 파티션 분석 (계정명별 그룹핑)
     *
     * POST /api/projects/{projectId}/upload/analyze-partitions
     */
    @Operation(summary = "파티션 분석", description = "계정명별 파일 그룹핑 및 세션 파티션 제안")
    @PostMapping("/analyze-partitions")
    public ResponseEntity<Map<String, Object>> analyzePartitions(
            @PathVariable String projectId,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            @RequestBody Map<String, List<String>> request) {

        String userId = userPrincipal.getId();
        List<String> fileIds = request.get("fileIds");

        log.info("파티션 분석 요청: projectId={}, userId={}, fileIds={}",
                projectId, userId, fileIds);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // 파일 분석 및 파티션 생성
        List<AccountPartitionResponse> partitions =
                fileAnalysisService.analyzeFilesAndCreatePartitions(projectId, fileIds);

        log.info("파티션 분석 완료: {} 개 파티션 생성", partitions.size());

        return ResponseEntity.ok(Map.of("partitions", partitions));
    }

    /**
     * 파일 컬럼 설정
     *
     * PUT /api/projects/{projectId}/upload/files/{fileId}/columns
     *
     * 계정명/금액 컬럼 설정
     */
    @Operation(summary = "파일 컬럼 설정", description = "계정명/금액 컬럼 지정")
    @PutMapping("/files/{fileId}/columns")
    public ResponseEntity<UploadedFileInfo> setFileColumns(
            @PathVariable String projectId,
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            @Valid @RequestBody SetFileColumnsRequest request) {

        String userId = userPrincipal.getId();
        log.info("파일 컬럼 설정: projectId={},userId = {}, fileId={}", projectId, userId ,fileId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // 컬럼 설정
        UploadedFileInfo fileInfo = uploadService.setFileColumns(projectId, fileId, request);

        return ResponseEntity.ok(fileInfo);
    }

    /**
     * 계정명 값 추출
     */
    @PostMapping("/files/{fileId}/extract-accounts")
    public ResponseEntity<Map<String, List<String>>> extractAccountValues(
            @PathVariable String projectId,
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            @RequestBody Map<String, String> request) {

        String userId = userPrincipal.getId();
        String columnName = request.get("columnName");

        log.info("계정명 추출: fileId={}, userId ={} ,columnName={}", fileId, userId, columnName);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // FileAnalysisService 활용
        List<String> accounts = uploadService.extractAccountValues(projectId, fileId, columnName);

        return ResponseEntity.ok(Map.of("accounts", accounts));
    }

    /**
     * 금액 합계 계산
     */
    @PostMapping("/files/{fileId}/calculate-amount")
    public ResponseEntity<Map<String, Double>> calculateTotalAmount(
            @PathVariable String projectId,
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            @RequestBody Map<String, String> request) {

        String userId = userPrincipal.getId();
        String columnName = request.get("columnName");

        log.info("금액 합산: fileId={},userId = {}, columnName={}", fileId, userId ,columnName);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // UploadService에 메서드 추가 필요
        Double totalAmount = uploadService.calculateTotalAmount(projectId, fileId, columnName);

        return ResponseEntity.ok(Map.of("totalAmount", totalAmount));
    }

    /**
     * 파일 삭제
     */
    @DeleteMapping("/files/{fileId}")
    public ResponseEntity<Void> deleteFile(
            @PathVariable String projectId,
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("파일 삭제: fileId={} , userId ={}", fileId , userId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // UploadService에 메서드 추가 필요
        uploadService.deleteFile(projectId, fileId);

        return ResponseEntity.noContent().build();
    }
}