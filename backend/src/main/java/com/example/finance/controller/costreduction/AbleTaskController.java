package com.example.finance.controller.costreduction;

import com.example.finance.dto.request.costreduction.AddLinkRequest;
import com.example.finance.dto.request.costreduction.CreateTaskRequest;
import com.example.finance.dto.request.costreduction.CreateWeeklyProgressRequest;
import com.example.finance.dto.request.costreduction.UpdateTaskRequest;
import com.example.finance.dto.response.costreduction.TaskDocumentResponse;
import com.example.finance.dto.response.costreduction.TaskResponse;
import com.example.finance.dto.response.costreduction.TaskSummaryResponse;
import com.example.finance.dto.response.costreduction.WeeklyProgressResponse;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.costreduction.AbleTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/tasks")
@RequiredArgsConstructor
/**
 * Able Task 컨트롤러
 *
 * 원가절감 과제(Task) 관리 기능을 제공한다.
 * 과제 CRUD, 문서 관리(링크/파일), 주간 진척 관리 등의 API를 포함한다.
 *
 * Base Path: /api/projects/{projectId}/tasks
 */
public class AbleTaskController {

    private final AbleTaskService ableTaskService;

    /**
     * 과제 생성
     *
     * @param projectId 프로젝트 ID
     * @param request 과제 생성 요청 DTO
     * @param userPrincipal 인증된 사용자 정보
     * @return 생성된 과제 정보
     */
    @PostMapping
    public ResponseEntity<TaskResponse> createTask(
            @PathVariable String projectId,
            @RequestBody CreateTaskRequest request,
            @CurrentUser UserPrincipal userPrincipal) {
        TaskResponse response = ableTaskService.createTask(projectId, request, userPrincipal.getId());
        return ResponseEntity.ok(response);
    }

    /**
     * 프로젝트 내 과제 목록 조회
     *
     * @param projectId 프로젝트 ID
     * @param userPrincipal 인증된 사용자 정보
     * @return 과제 목록
     */
    @GetMapping
    public ResponseEntity<List<TaskResponse>> getTasks(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        List<TaskResponse> tasks = ableTaskService.getTasksByProject(projectId);
        return ResponseEntity.ok(tasks);
    }

    /**
     * 잠금된 통계 ID 목록 조회 (과제에 연결된 통계)
     */
    @GetMapping("/locked-statistics")
    public ResponseEntity<List<String>> getLockedStatistics(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        List<String> lockedIds = ableTaskService.getLockedStatisticsIds(projectId);
        return ResponseEntity.ok(lockedIds);
    }

    /**
     * 과제 요약 정보 조회 (상태별 집계)
     */
    @GetMapping("/summary")
    public ResponseEntity<TaskSummaryResponse> getSummary(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        TaskSummaryResponse summary = ableTaskService.getSummary(projectId);
        return ResponseEntity.ok(summary);
    }

    @GetMapping("/{taskId}")
    public ResponseEntity<TaskResponse> getTask(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @CurrentUser UserPrincipal userPrincipal) {
        TaskResponse response = ableTaskService.getTask(taskId);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{taskId}")
    public ResponseEntity<TaskResponse> updateTask(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @RequestBody UpdateTaskRequest request,
            @CurrentUser UserPrincipal userPrincipal) {
        TaskResponse response = ableTaskService.updateTask(taskId, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{taskId}/reset")
    public ResponseEntity<TaskResponse> resetTask(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @CurrentUser UserPrincipal userPrincipal) {
        TaskResponse response = ableTaskService.resetTask(taskId);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{taskId}")
    public ResponseEntity<Void> deleteTask(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @CurrentUser UserPrincipal userPrincipal) {
        ableTaskService.deleteTask(taskId);
        return ResponseEntity.noContent().build();
    }

    // ===== Document Management =====

    @GetMapping("/{taskId}/documents")
    public ResponseEntity<List<TaskDocumentResponse>> getDocuments(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @CurrentUser UserPrincipal userPrincipal) {
        List<TaskDocumentResponse> documents = ableTaskService.getDocuments(taskId);
        return ResponseEntity.ok(documents);
    }

    @PostMapping("/{taskId}/documents/link")
    public ResponseEntity<TaskDocumentResponse> addLink(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @RequestBody AddLinkRequest request,
            @CurrentUser UserPrincipal userPrincipal) {
        TaskDocumentResponse response = ableTaskService.addLink(taskId, projectId, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{taskId}/documents/upload-url")
    public ResponseEntity<Map<String, String>> getUploadUrl(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @RequestParam String fileName,
            @CurrentUser UserPrincipal userPrincipal) {
        Map<String, String> result = ableTaskService.generateUploadUrl(taskId, projectId, fileName);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{taskId}/documents/{documentId}/download-url")
    public ResponseEntity<Map<String, String>> getDocumentDownloadUrl(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @PathVariable String documentId,
            @CurrentUser UserPrincipal userPrincipal) {
        String downloadUrl = ableTaskService.getDocumentDownloadUrl(documentId);
        return ResponseEntity.ok(Map.of("downloadUrl", downloadUrl));
    }

    @DeleteMapping("/{taskId}/documents/{documentId}")
    public ResponseEntity<Void> deleteDocument(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @PathVariable String documentId,
            @CurrentUser UserPrincipal userPrincipal) {
        ableTaskService.deleteDocument(documentId);
        return ResponseEntity.noContent().build();
    }

    // ===== Weekly Progress Management =====

    @GetMapping("/{taskId}/weekly-progress")
    public ResponseEntity<List<WeeklyProgressResponse>> getWeeklyProgress(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @CurrentUser UserPrincipal userPrincipal) {
        List<WeeklyProgressResponse> list = ableTaskService.getWeeklyProgress(taskId);
        return ResponseEntity.ok(list);
    }

    @PostMapping("/{taskId}/weekly-progress")
    public ResponseEntity<WeeklyProgressResponse> createWeeklyProgress(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @RequestBody CreateWeeklyProgressRequest request,
            @CurrentUser UserPrincipal userPrincipal) {
        WeeklyProgressResponse response = ableTaskService.createWeeklyProgress(taskId, projectId, request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{taskId}/weekly-progress/{progressId}")
    public ResponseEntity<WeeklyProgressResponse> updateWeeklyProgress(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @PathVariable String progressId,
            @RequestBody CreateWeeklyProgressRequest request,
            @CurrentUser UserPrincipal userPrincipal) {
        WeeklyProgressResponse response = ableTaskService.updateWeeklyProgress(progressId, request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{taskId}/weekly-progress/{progressId}")
    public ResponseEntity<Void> deleteWeeklyProgress(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @PathVariable String progressId,
            @CurrentUser UserPrincipal userPrincipal) {
        ableTaskService.deleteWeeklyProgress(progressId);
        return ResponseEntity.noContent().build();
    }
}
