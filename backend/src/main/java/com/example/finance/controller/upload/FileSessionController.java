package com.example.finance.controller.upload;

import com.example.finance.dto.request.session.CreateSessionsBatchRequest;
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
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.example.finance.service.data.SessionDataService;
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
    private final SessionDataService sessionDataService;

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
     * [개선됨] 세션 일괄 생성
     * 변경사항: Map 대신 DTO 사용, @Valid 추가, Service 타입 일치
     */
    @Operation(summary = "세션 일괄 생성", description = "파티션 분석 결과를 기반으로 여러 세션을 한 번에 생성합니다.")
    @PostMapping("/batch")
    public ResponseEntity<List<FileSessionResponse>> createSessionsBatch(
            @PathVariable String projectId,
            @AuthenticationPrincipal UserPrincipal userPrincipal, // @CurrentUser 대신 표준 어노테이션 사용 권장
            @Valid @RequestBody CreateSessionsBatchRequest request) {

        String userId = userPrincipal.getId();

        // 요청 로그 (DTO 덕분에 null 체크 불필요)
        log.info("세션 일괄 생성 요청: projectId={}, userId={}, partitionCount={}",
                projectId, userId, request.getPartitions().size());

        // 1. 프로젝트 권한 확인 (Service 내부에서도 체크하지만, 진입점에서 명시적 체크)
        // (ProjectService의 구현에 따라 필요 여부 결정)
        // projectService.validateProjectMember(projectId, userId);

        // 2. 파티션별로 세션 생성 (Service 호출)
        List<FileSessionResponse> sessions = fileSessionService.createSessionsFromPartitions(
                userId,
                projectId,
                request.getPartitions() // List<AccountPartition> 전달
        );

        log.info("세션 일괄 생성 완료: {} 개 세션 생성됨", sessions.size());

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

    // 엔드포인트 추가
    @Operation(summary = "계정 분석 시작", description = "raw_data에서 session_data로 데이터 복사")
    @PostMapping("/{sessionId}/analyze")
    public ResponseEntity<Map<String, Object>> startAccountAnalysis(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        log.info("계정 분석 시작 요청: projectId={}, sessionId={}", projectId, sessionId);

        projectService.getProject(projectId, userId);

        Map<String, Object> result = sessionDataService.startAccountAnalysis(sessionId);
        result.put("success", true);

        return ResponseEntity.ok(result);
    }

    /**
     * ⭐ 4단계: 계정 분석 상태 조회 (폴링용)
     *
     * GET /api/projects/{projectId}/upload/sessions/{sessionId}/analyze/status
     */
    @Operation(summary = "분석 상태 조회", description = "계정 분석 진행 상태 폴링")
    @GetMapping("/{sessionId}/analyze/status")
    public ResponseEntity<Map<String, Object>> getAnalysisStatus(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        projectService.getProject(projectId, userId);

        Map<String, Object> status = sessionDataService.getAnalysisStatus(sessionId);
        return ResponseEntity.ok(status);
    }

    @Operation(summary = "세션 데이터 조회", description = "session_data 컬렉션 페이징 조회")
    @GetMapping("/{sessionId}/data")
    public ResponseEntity<Map<String, Object>> getSessionData(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "1000") int size,
            @CurrentUser UserPrincipal userPrincipal) {

        String userId = userPrincipal.getId();
        projectService.getProject(projectId, userId);

        Map<String, Object> result = sessionDataService.getSessionData(sessionId, page, size);
        return ResponseEntity.ok(result);
    }

    // ========== 컬럼 매핑 API ==========

    @Operation(summary = "컬럼 매핑 조회", description = "세션의 컬럼 매핑 정보 조회 (없으면 자동 초기화)")
    @GetMapping("/{sessionId}/column-mappings")
    public ResponseEntity<?> getColumnMappings(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(sessionDataService.getColumnMappings(sessionId));
    }

    @Operation(summary = "컬럼 가시성 변경", description = "특정 컬럼의 is_visible 토글")
    @PutMapping("/{sessionId}/column-mappings/{columnName}/visibility")
    public ResponseEntity<?> updateColumnVisibility(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @PathVariable String columnName,
            @RequestBody Map<String, Boolean> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        boolean isVisible = body.getOrDefault("isVisible", true);
        return ResponseEntity.ok(sessionDataService.updateColumnVisibility(sessionId, columnName, isVisible));
    }

    @Operation(summary = "컬럼 매핑 일괄 업데이트")
    @PutMapping("/{sessionId}/column-mappings/batch")
    public ResponseEntity<?> updateColumnMappingsBatch(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> updates = (List<Map<String, Object>>) body.get("updates");
        return ResponseEntity.ok(sessionDataService.updateColumnMappingsBatch(sessionId, updates));
    }

    // ========== 데이터 삭제 (is_hidden) API ==========

    @Operation(summary = "세션 데이터 검색", description = "특정 컬럼의 값으로 session_data 검색")
    @GetMapping("/{sessionId}/data/search")
    public ResponseEntity<?> searchSessionData(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam String columnName,
            @RequestParam String keyword,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(sessionDataService.searchSessionData(sessionId, columnName, keyword));
    }

    @Operation(summary = "컬럼 고유 값 조회", description = "특정 컬럼의 고유 값 목록 + 건수 조회")
    @GetMapping("/{sessionId}/data/distinct-values")
    public ResponseEntity<?> getDistinctValues(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam String columnName,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(sessionDataService.getDistinctValues(sessionId, columnName));
    }

    @Operation(summary = "데이터 행 숨김", description = "선택된 row의 is_hidden=true 처리")
    @PostMapping("/{sessionId}/data/hide")
    public ResponseEntity<?> hideSessionDataRows(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, List<String>> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        List<String> rowIds = body.get("rowIds");
        long count = sessionDataService.hideSessionDataRows(sessionId, rowIds);
        return ResponseEntity.ok(Map.of("hiddenCount", count));
    }

    @Operation(summary = "데이터 행 원복", description = "선택된 row의 is_hidden=false 복원")
    @PostMapping("/{sessionId}/data/restore")
    public ResponseEntity<?> restoreSessionDataRows(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, List<String>> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        List<String> rowIds = body.get("rowIds");
        long count = sessionDataService.restoreSessionDataRows(sessionId, rowIds);
        return ResponseEntity.ok(Map.of("restoredCount", count));
    }

    @Operation(summary = "컬럼 고유 값 + hidden 상태 조회", description = "visible/hidden 분리된 고유 값 목록")
    @GetMapping("/{sessionId}/data/distinct-values-status")
    public ResponseEntity<?> getDistinctValuesWithStatus(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam String columnName,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(sessionDataService.getDistinctValuesWithStatus(sessionId, columnName));
    }

    @Operation(summary = "컬럼 값 기반 데이터 숨김", description = "특정 컬럼 값에 해당하는 행 is_hidden=true")
    @PostMapping("/{sessionId}/data/hide-by-values")
    public ResponseEntity<?> hideByColumnValues(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        String columnName = (String) body.get("columnName");
        @SuppressWarnings("unchecked")
        List<String> values = (List<String>) body.get("values");
        long count = sessionDataService.hideByColumnValues(sessionId, columnName, values);
        return ResponseEntity.ok(Map.of("hiddenCount", count));
    }

    @Operation(summary = "컬럼 값 기반 데이터 원복", description = "특정 컬럼 값에 해당하는 hidden 행 복원")
    @PostMapping("/{sessionId}/data/restore-by-values")
    public ResponseEntity<?> restoreByColumnValues(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        String columnName = (String) body.get("columnName");
        @SuppressWarnings("unchecked")
        List<String> values = (List<String>) body.get("values");
        long count = sessionDataService.restoreByColumnValues(sessionId, columnName, values);
        return ResponseEntity.ok(Map.of("restoredCount", count));
    }

    @Operation(summary = "두 컬럼 그룹바이", description = "key열+변경열 기준 그룹바이 결과 조회")
    @GetMapping("/{sessionId}/data/group-by-two")
    public ResponseEntity<?> groupByTwoColumns(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam String keyColumn,
            @RequestParam String changeColumn,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(sessionDataService.groupByTwoColumns(sessionId, keyColumn, changeColumn));
    }

    @Operation(summary = "표준화 수행", description = "key열 기준 변경열 데이터를 최빈값으로 통일")
    @PostMapping("/{sessionId}/data/standardize")
    public ResponseEntity<?> standardizeData(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, String> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        String keyColumn = body.get("keyColumn");
        String changeColumn = body.get("changeColumn");
        return ResponseEntity.ok(sessionDataService.standardizeData(sessionId, keyColumn, changeColumn));
    }

    @Operation(summary = "process_data 생성 (Step 2→3)", description = "session_data에서 visible 컬럼만 추출하여 process_data 생성")
    @PostMapping("/{sessionId}/data/prepare-process")
    public ResponseEntity<Map<String, Object>> prepareProcessData(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());

        @SuppressWarnings("unchecked")
        Map<String, String> requiredColumns = (Map<String, String>) body.get("requiredColumns");

        Map<String, Object> result = sessionDataService.prepareProcessData(sessionId, requiredColumns);
        return ResponseEntity.ok(result);
    }

    /**
     * process_data 생성 진행 상태 조회 (폴링)
     *
     * GET /api/projects/{projectId}/upload/sessions/{sessionId}/data/process-status
     */
    @GetMapping("/{sessionId}/data/process-status")
    public ResponseEntity<Map<String, Object>> getProcessDataStatus(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        Map<String, Object> result = sessionDataService.getProcessDataStatus(sessionId);
        return ResponseEntity.ok(result);
    }

    /**
     * 세션 완료 처리 (Step 1 → Step 2)
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