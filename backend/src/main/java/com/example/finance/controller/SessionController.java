// backend/src/main/java/com/example/finance/controller/SessionController.java

package com.example.finance.controller;

import com.example.finance.dto.*;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.SessionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/sessions")
@RequiredArgsConstructor
public class SessionController {

    private final SessionService sessionService;

    /**
     * 파티션 분석
     */
    @PostMapping("/analyze-partitions")
    public ResponseEntity<Map<String, Object>> analyzePartitions(
            @PathVariable String projectId,
            @RequestBody AnalyzePartitionsRequest request) {

        log.info("파티션 분석: projectId={}, fileIds={}", projectId, request.getFileIds());

        List<AccountPartition> partitions = sessionService.analyzePartitions(
                projectId,
                request.getFileIds()
        );

        return ResponseEntity.ok(Map.of("partitions", partitions));
    }

    /**
     * 세션 생성
     */
    @PostMapping
    public ResponseEntity<Map<String, List<SessionMetadata>>> createSessions(
            @PathVariable String projectId,
            @RequestBody CreateSessionsRequest request,
            @CurrentUser UserPrincipal userPrincipal) {

        log.info("세션 생성: projectId={}, partitions={}", projectId, request.getPartitions().size());

        List<SessionMetadata> sessions = sessionService.createSessions(
                projectId,
                userPrincipal.getId(),
                request.getPartitions()
        );

        return ResponseEntity.ok(Map.of("sessions", sessions));
    }

    /**
     * 세션 목록 조회
     */
    @GetMapping
    public ResponseEntity<List<SessionMetadata>> getSessions(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {

        List<SessionMetadata> sessions = sessionService.getSessions(projectId, userPrincipal.getId());
        return ResponseEntity.ok(sessions);
    }

    /**
     * 세션 수정
     */
    @PutMapping("/{sessionId}")
    public ResponseEntity<SessionMetadata> updateSession(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> updates) {

        log.info("세션 수정: sessionId={}, updates={}", sessionId, updates);

        SessionMetadata updated = sessionService.updateSession(projectId, sessionId, updates);
        return ResponseEntity.ok(updated);
    }

    /**
     * 세션에 파일 추가
     */
    @PostMapping("/{sessionId}/add-files")
    public ResponseEntity<SessionMetadata> addFilesToSession(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody AddFilesToSessionRequest request) {

        log.info("세션에 파일 추가: sessionId={}, fileIds={}", sessionId, request.getFileIds());

        SessionMetadata updated = sessionService.addFilesToSession(
                projectId,
                sessionId,
                request.getFileIds()
        );

        return ResponseEntity.ok(updated);
    }

    /**
     * 세션 병합
     */
    @PostMapping("/merge")
    public ResponseEntity<SessionMetadata> mergeSessions(
            @PathVariable String projectId,
            @RequestBody MergeSessionsRequest request) {

        log.info("세션 병합: projectId={}, sessionIds={}", projectId, request.getSessionIds());

        SessionMetadata merged = sessionService.mergeSessions(projectId, request.getSessionIds());
        return ResponseEntity.ok(merged);
    }

    /**
     * 세션 일괄 삭제
     */
    @PostMapping("/delete-batch")
    public ResponseEntity<Void> deleteSessions(
            @PathVariable String projectId,
            @RequestBody DeleteSessionsRequest request) {

        log.info("세션 일괄 삭제: projectId={}, sessionIds={}", projectId, request.getSessionIds());

        sessionService.deleteSessions(projectId, request.getSessionIds());
        return ResponseEntity.ok().build();
    }

    /**
     * 세션 완료 (계정 분석 시작)
     */
    @PostMapping("/{sessionId}/complete")
    public ResponseEntity<Map<String, Object>> completeSession(
            @PathVariable String projectId,
            @PathVariable String sessionId) {

        log.info("세션 완료: projectId={}, sessionId={}", projectId, sessionId);

        Map<String, Object> result = sessionService.completeSession(projectId, sessionId);
        return ResponseEntity.ok(result);
    }

    /**
     * 결과 다운로드 URL
     */
    @GetMapping("/{sessionId}/result/download")
    public ResponseEntity<Map<String, String>> getDownloadUrl(
            @PathVariable String projectId,
            @PathVariable String sessionId) {

        log.info("다운로드 URL 요청: projectId={}, sessionId={}", projectId, sessionId);

        String downloadUrl = sessionService.getDownloadUrl(projectId, sessionId);
        return ResponseEntity.ok(Map.of("downloadUrl", downloadUrl));
    }
}