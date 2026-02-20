package com.example.finance.controller.costreduction;

import com.example.finance.dto.request.costreduction.AddLinkRequest;
import com.example.finance.dto.request.costreduction.CreateTaskRequest;
import com.example.finance.dto.request.costreduction.UpdateTaskRequest;
import com.example.finance.dto.response.costreduction.TaskDocumentResponse;
import com.example.finance.dto.response.costreduction.TaskResponse;
import com.example.finance.dto.response.costreduction.TaskSummaryResponse;
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
public class AbleTaskController {

    private final AbleTaskService ableTaskService;

    @PostMapping
    public ResponseEntity<TaskResponse> createTask(
            @PathVariable String projectId,
            @RequestBody CreateTaskRequest request,
            @CurrentUser UserPrincipal userPrincipal) {
        TaskResponse response = ableTaskService.createTask(projectId, request, userPrincipal.getId());
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<List<TaskResponse>> getTasks(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        List<TaskResponse> tasks = ableTaskService.getTasksByProject(projectId);
        return ResponseEntity.ok(tasks);
    }

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

    @DeleteMapping("/{taskId}/documents/{documentId}")
    public ResponseEntity<Void> deleteDocument(
            @PathVariable String projectId,
            @PathVariable String taskId,
            @PathVariable String documentId,
            @CurrentUser UserPrincipal userPrincipal) {
        ableTaskService.deleteDocument(documentId);
        return ResponseEntity.noContent().build();
    }
}
