package com.example.finance.controller;

import com.example.finance.dto.request.CreateFileSessionRequest;
import com.example.finance.dto.request.MergeSessionsRequest;
import com.example.finance.dto.request.SetFileColumnsRequest;
import com.example.finance.dto.request.UpdateFileSessionRequest;
import com.example.finance.dto.response.FileSessionResponse;
import com.example.finance.model.FileSession;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.FileSessionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;

/**
 * 파일 세션 컨트롤러
 *
 * Phase 2.1: Multi File Upload & Session Management
 */
@Slf4j
@RestController
@RequestMapping("/api/sessions")
@RequiredArgsConstructor
public class FileSessionController {

    private final FileSessionService fileSessionService;

    /**
     * 파일 세션 생성
     */
    @PostMapping
    public ResponseEntity<FileSession> createSession(
            @CurrentUser UserPrincipal userPrincipal,
            @Valid @RequestBody CreateFileSessionRequest request) {

        log.info("세션 생성 요청: userId={}, projectId={}, sessionName={}",
                userPrincipal.getId(), request.getProjectId(), request.getSessionName());

        FileSession session = fileSessionService.createFileSession(
                userPrincipal.getId(), request);

        return ResponseEntity.ok(session);
    }

    /**
     * 프로젝트 세션 목록 조회
     */
    @GetMapping
    public ResponseEntity<List<FileSessionResponse>> getProjectSessions(
            @CurrentUser UserPrincipal userPrincipal,
            @RequestParam String projectId) {

        log.info("프로젝트 세션 목록 조회: projectId={}", projectId);

        List<FileSessionResponse> sessions = fileSessionService.getProjectSessions(
                projectId, userPrincipal.getId());

        return ResponseEntity.ok(sessions);
    }

    /**
     * 세션 상세 조회
     */
    @GetMapping("/{sessionId}")
    public ResponseEntity<FileSessionResponse> getSession(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String sessionId) {

        log.info("세션 조회: sessionId={}", sessionId);

        FileSessionResponse session = fileSessionService.getFileSession(
                sessionId, userPrincipal.getId());

        return ResponseEntity.ok(session);
    }

    /**
     * 세션 정보 수정 (세션명, 작업자명)
     */
    @PutMapping("/{sessionId}")
    public ResponseEntity<FileSession> updateSession(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String sessionId,
            @Valid @RequestBody UpdateFileSessionRequest request) {

        log.info("세션 수정: sessionId={}", sessionId);

        FileSession session = fileSessionService.updateFileSession(
                sessionId, userPrincipal.getId(), request);

        return ResponseEntity.ok(session);
    }

    /**
     * 파일 컬럼 설정 (계정명, 금액 컬럼)
     */
    @PutMapping("/{sessionId}/columns")
    public ResponseEntity<FileSession> setFileColumns(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String sessionId,
            @Valid @RequestBody SetFileColumnsRequest request) {

        log.info("파일 컬럼 설정: sessionId={}, fileId={}", sessionId, request.getFileId());

        FileSession session = fileSessionService.setFileColumns(
                sessionId, userPrincipal.getId(), request);

        return ResponseEntity.ok(session);
    }

    /**
     * 세션 시작 (Step 2 진입)
     */
    @PostMapping("/{sessionId}/start")
    public ResponseEntity<FileSession> startSession(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String sessionId) {

        log.info("세션 시작: sessionId={}", sessionId);

        FileSession session = fileSessionService.startSession(
                sessionId, userPrincipal.getId());

        return ResponseEntity.ok(session);
    }

    /**
     * 세션 초기화 (모든 데이터 삭제)
     */
    @DeleteMapping("/{sessionId}/reset")
    public ResponseEntity<Void> resetSession(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String sessionId) {

        log.info("세션 초기화: sessionId={}", sessionId);

        fileSessionService.resetSession(sessionId, userPrincipal.getId());

        return ResponseEntity.noContent().build();
    }

    /**
     * 세션 삭제 (소프트 삭제)
     */
    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Void> deleteSession(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String sessionId) {

        log.info("세션 삭제: sessionId={}", sessionId);

        fileSessionService.deleteSession(sessionId, userPrincipal.getId());

        return ResponseEntity.noContent().build();
    }

    /**
     * 세션 병합
     */
    @PostMapping("/merge")
    public ResponseEntity<FileSession> mergeSessions(
            @CurrentUser UserPrincipal userPrincipal,
            @Valid @RequestBody MergeSessionsRequest request) {

        log.info("세션 병합 요청: sessionIds={}", request.getSessionIds());

        FileSession mergedSession = fileSessionService.mergeSessions(
                userPrincipal.getId(), request);

        return ResponseEntity.ok(mergedSession);
    }
}