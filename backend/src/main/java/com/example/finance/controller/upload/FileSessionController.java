package com.example.finance.controller.upload;

import com.example.finance.dto.request.upload.CreateFileSessionRequest;
import com.example.finance.dto.request.upload.MergeSessionsRequest;
import com.example.finance.dto.request.upload.SetFileColumnsRequest;
import com.example.finance.dto.request.upload.UpdateFileSessionRequest;
import com.example.finance.dto.response.session.FileSessionResponse;
import com.example.finance.dto.response.upload.AccountPartitionResponse;
import com.example.finance.model.session.FileSession;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.project.ProjectService;
import com.example.finance.service.upload.FileSessionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 파일 세션 컨트롤러
 *
 * Step 1: Multi File Upload - 세션 관리
 *
 * Base Path: /api/projects/{projectId}/upload/sessions
 */
@Tag(name = "FileSession", description = "파일 세션 API")
@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/upload/sessions")
@RequiredArgsConstructor
public class FileSessionController {

    private final FileSessionService fileSessionService;
    private final ProjectService projectService;

    /**
     * 파일 세션 생성
     *
     * POST /api/projects/{projectId}/upload/sessions
     */
    @Operation(summary = "세션 생성", description = "업로드된 파일들로 세션 생성")
    @PostMapping
    public ResponseEntity<FileSession> createSession(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal,
            @Valid @RequestBody CreateFileSessionRequest request) {

        String userId = userPrincipal.getId();
        log.info("세션 생성 요청: projectId={}, userId={}, sessionName={}",
                projectId, userId, request.getSessionName());

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        FileSession session = fileSessionService.createFileSession(userId, request);

        return ResponseEntity.ok(session);
    }

    /**
     * 세션 일괄 생성 (파티션 기반)`
     *
     * POST /api/projects/{projectId}/upload/sessions/batch
     */
    // ⭐⭐⭐ 신규 API: 세션 일괄 생성
    @Operation(summary = "세션 일괄 생성", description = "파티션별로 세션 일괄 생성")
    @PostMapping("/batch")
    public ResponseEntity<List<FileSessionResponse>> createSessionsBatch(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal,
            @RequestBody Map<String, List<AccountPartitionResponse>> request) {

        String userId = userPrincipal.getId();
        List<AccountPartitionResponse> partitions = request.get("partitions");

        log.info("세션 일괄 생성 요청: projectId={}, userId={}, partitions={}",
                projectId, userId, partitions != null ? partitions.size() : 0);

        projectService.getProject(projectId, userId);

        // 파티션별로 세션 생성
        List<FileSessionResponse> sessions = fileSessionService.createSessionsFromPartitions(
                userId, projectId, partitions
        );

        log.info("세션 일괄 생성 완료: {} 개 세션", sessions.size());

        return ResponseEntity.ok(sessions);
    }

    /**
     * 프로젝트 세션 목록 조회
     *
     * GET /api/projects/{projectId}/upload/sessions
     */
    @Operation(summary = "세션 목록", description = "프로젝트 내 모든 세션 조회")
    @GetMapping
    public ResponseEntity<List<FileSessionResponse>> getProjectSessions(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("프로젝트 세션 목록 조회: projectId={}", projectId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        List<FileSessionResponse> sessions = fileSessionService.getProjectSessions(
                projectId, userId);

        return ResponseEntity.ok(sessions);
    }

    /**
     * 세션 상세 조회
     *
     * GET /api/projects/{projectId}/upload/sessions/{sessionId}
     */
    @Operation(summary = "세션 상세", description = "세션 상세 정보 조회")
    @GetMapping("/{sessionId}")
    public ResponseEntity<FileSessionResponse> getSession(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("세션 조회: projectId={}, sessionId={}", projectId, sessionId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        FileSessionResponse session = fileSessionService.getFileSession(
                sessionId, userId);

        return ResponseEntity.ok(session);
    }

    /**
     * 세션 정보 수정 (세션명, 작업자명)
     *
     * PUT /api/projects/{projectId}/upload/sessions/{sessionId}
     */
    @Operation(summary = "세션 수정", description = "세션명/작업자명 수정")
    @PutMapping("/{sessionId}")
    public ResponseEntity<FileSession> updateSession(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal,
            @Valid @RequestBody UpdateFileSessionRequest request) {

        String userId = userPrincipal.getId();
        log.info("세션 수정: projectId={}, sessionId={}", projectId, sessionId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        FileSession session = fileSessionService.updateFileSession(
                sessionId, userId, request);

        return ResponseEntity.ok(session);
    }

    /**
     * 파일 컬럼 설정 (계정명, 금액 컬럼)
     *
     * PUT /api/projects/{projectId}/upload/sessions/{sessionId}/columns
     */
    @Operation(summary = "컬럼 설정", description = "파일의 계정명/금액 컬럼 지정")
    @PutMapping("/{sessionId}/columns")
    public ResponseEntity<FileSession> setFileColumns(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal,
            @Valid @RequestBody SetFileColumnsRequest request) {

        String userId = userPrincipal.getId();
        log.info("파일 컬럼 설정: projectId={}, sessionId={}, fileId={}",
                projectId, sessionId, request.getFileId());

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        FileSession session = fileSessionService.setFileColumns(
                sessionId, userId, request);

        return ResponseEntity.ok(session);
    }

    /**
     * 세션 시작 (Step 2 진입)
     *
     * POST /api/projects/{projectId}/upload/sessions/{sessionId}/start
     */
    @Operation(summary = "세션 시작", description = "세션 시작 (Step 2: File Load 진입)")
    @PostMapping("/{sessionId}/start")
    public ResponseEntity<FileSession> startSession(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("세션 시작: projectId={}, sessionId={}", projectId, sessionId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        FileSession session = fileSessionService.startSession(sessionId, userId);

        return ResponseEntity.ok(session);
    }

    /**
     * 세션 초기화 (모든 데이터 삭제)
     *
     * DELETE /api/projects/{projectId}/upload/sessions/{sessionId}/reset
     */
    @Operation(summary = "세션 초기화", description = "세션 데이터 전체 삭제 (raw_data, process_data, clustering_results)")
    @DeleteMapping("/{sessionId}/reset")
    public ResponseEntity<Void> resetSession(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("세션 초기화: projectId={}, sessionId={}", projectId, sessionId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        fileSessionService.resetSession(sessionId, userId);

        return ResponseEntity.noContent().build();
    }

    /**
     * 세션 삭제 (소프트 삭제)
     *
     * DELETE /api/projects/{projectId}/upload/sessions/{sessionId}
     */
    @Operation(summary = "세션 삭제", description = "세션 소프트 삭제 (isDeleted=true)")
    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Void> deleteSession(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("세션 삭제: projectId={}, sessionId={}", projectId, sessionId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        fileSessionService.deleteSession(sessionId, userId);

        return ResponseEntity.noContent().build();
    }

    /**
     * 세션 병합
     *
     * POST /api/projects/{projectId}/upload/sessions/merge
     */
    @Operation(summary = "세션 병합", description = "여러 세션을 하나로 병합")
    @PostMapping("/merge")
    public ResponseEntity<FileSession> mergeSessions(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal,
            @Valid @RequestBody MergeSessionsRequest request) {

        String userId = userPrincipal.getId();
        log.info("세션 병합 요청: projectId={}, sessionIds={}", projectId, request.getSessionIds());

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        FileSession mergedSession = fileSessionService.mergeSessions(userId, request);

        return ResponseEntity.ok(mergedSession);
    }

    /**
     * 세션에 파일 추가
     */
    @PostMapping("/{sessionId}/add-files")
    public ResponseEntity<FileSession> addFilesToSession(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal,
            @Valid @RequestBody Map<String, List<String>> request) {

        String userId = userPrincipal.getId();
        List<String> fileIds = request.get("fileIds");

        log.info("세션에 파일 추가: sessionId={}, fileIds={}", sessionId, fileIds);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // FileSessionService에 메서드 추가 필요
        FileSession session = fileSessionService.addFilesToSession(sessionId, userId, fileIds);

        return ResponseEntity.ok(session);
    }

    /**
     * 세션 일괄 삭제
     */
    @PostMapping("/delete-batch")
    public ResponseEntity<Void> deleteSessions(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal,
            @Valid @RequestBody Map<String, List<String>> request) {

        String userId = userPrincipal.getId();
        List<String> sessionIds = request.get("sessionIds");

        log.info("세션 일괄 삭제: sessionIds={}", sessionIds);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // FileSessionService에 메서드 추가 필요
        fileSessionService.deleteSessions(projectId, sessionIds);

        return ResponseEntity.noContent().build();
    }

    /**
     * 세션 완료 처리 (Step 2 진입)
     */
    @PostMapping("/{sessionId}/complete")
    public ResponseEntity<Map<String, Object>> completeSession(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("세션 완료: sessionId={}", sessionId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // FileSessionService에 메서드 추가 필요
        Map<String, Object> result = fileSessionService.completeSessionProcessing(sessionId, userId);

        return ResponseEntity.ok(result);
    }

    /**
     * 결과 다운로드 URL
     */
    @GetMapping("/{sessionId}/result/download")
    public ResponseEntity<Map<String, String>> getDownloadUrl(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("다운로드 URL 요청: sessionId={}", sessionId);

        // 프로젝트 권한 확인
        projectService.getProject(projectId, userId);

        // FileSessionService에 메서드 추가 필요
        String downloadUrl = fileSessionService.getResultDownloadUrl(sessionId, userId);

        return ResponseEntity.ok(Map.of("downloadUrl", downloadUrl));
    }
}