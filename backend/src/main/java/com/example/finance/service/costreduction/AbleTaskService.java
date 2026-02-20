package com.example.finance.service.costreduction;

import com.example.finance.dto.request.costreduction.AddLinkRequest;
import com.example.finance.dto.request.costreduction.CreateTaskRequest;
import com.example.finance.dto.request.costreduction.UpdateTaskRequest;
import com.example.finance.dto.response.costreduction.TaskDocumentResponse;
import com.example.finance.dto.response.costreduction.TaskResponse;
import com.example.finance.dto.response.costreduction.TaskSummaryResponse;
import com.example.finance.model.costreduction.AbleTask;
import com.example.finance.model.costreduction.TaskDocument;
import com.example.finance.repository.costreduction.AbleTaskRepository;
import com.example.finance.repository.costreduction.TaskDocumentRepository;
import com.example.finance.service.common.S3Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AbleTaskService {

    private final AbleTaskRepository ableTaskRepository;
    private final TaskDocumentRepository taskDocumentRepository;
    private final S3Service s3Service;

    /**
     * 과제 생성
     */
    public TaskResponse createTask(String projectId, CreateTaskRequest request, String userId) {
        List<AbleTask.ClusterRef> clusters = request.getClusters() != null
                ? request.getClusters().stream()
                    .map(c -> AbleTask.ClusterRef.builder()
                            .statisticsId(c.getStatisticsId())
                            .clusterName(c.getClusterName())
                            .accountName(c.getAccountName())
                            .build())
                    .toList()
                : List.of();

        AbleTask task = AbleTask.builder()
                .projectId(projectId)
                .taskName(request.getTaskName())
                .majorAccounts(request.getMajorAccounts())
                .clusters(clusters)
                .department(request.getDepartment())
                .manager(request.getManager())
                .consultant(request.getConsultant())
                .baseAmount(request.getBaseAmount())
                .expectedSavingRate(request.getExpectedSavingRate())
                .expectedSavingAmount(request.getExpectedSavingAmount())
                .progress(0)
                .status("진행 중")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .createdBy(userId)
                .build();

        task = ableTaskRepository.save(task);
        log.info("Task created: projectId={}, taskId={}", projectId, task.getId());
        return toResponse(task, 0);
    }

    /**
     * 프로젝트별 과제 목록 조회
     */
    public List<TaskResponse> getTasksByProject(String projectId) {
        List<AbleTask> tasks = ableTaskRepository.findByProjectId(projectId);

        // 각 과제의 문서 수 집계
        Map<String, Long> docCounts = tasks.stream()
                .collect(Collectors.toMap(
                        AbleTask::getId,
                        t -> taskDocumentRepository.countByTaskId(t.getId())
                ));

        return tasks.stream()
                .map(t -> toResponse(t, docCounts.getOrDefault(t.getId(), 0L).intValue()))
                .toList();
    }

    /**
     * 과제 상세 조회
     */
    public TaskResponse getTask(String taskId) {
        AbleTask task = ableTaskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("과제를 찾을 수 없습니다: " + taskId));
        int docCount = (int) taskDocumentRepository.countByTaskId(taskId);
        return toResponse(task, docCount);
    }

    /**
     * 과제 수정
     */
    public TaskResponse updateTask(String taskId, UpdateTaskRequest request) {
        AbleTask task = ableTaskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("과제를 찾을 수 없습니다: " + taskId));

        if (request.getTaskName() != null) task.setTaskName(request.getTaskName());
        if (request.getDepartment() != null) task.setDepartment(request.getDepartment());
        if (request.getManager() != null) task.setManager(request.getManager());
        if (request.getConsultant() != null) task.setConsultant(request.getConsultant());
        if (request.getBaseAmount() != null) task.setBaseAmount(request.getBaseAmount());
        if (request.getExpectedSavingRate() != null) task.setExpectedSavingRate(request.getExpectedSavingRate());
        if (request.getExpectedSavingAmount() != null) task.setExpectedSavingAmount(request.getExpectedSavingAmount());
        if (request.getProgress() != null) task.setProgress(request.getProgress());
        if (request.getStatus() != null) {
            task.setStatus(request.getStatus());
            if ("완료".equals(request.getStatus()) && task.getCompletedAt() == null) {
                task.setCompletedAt(LocalDateTime.now());
            }
        }
        if (request.getActualSaving() != null) task.setActualSaving(request.getActualSaving());
        if (request.getRating() != null) task.setRating(request.getRating());

        task.setUpdatedAt(LocalDateTime.now());
        task = ableTaskRepository.save(task);

        int docCount = (int) taskDocumentRepository.countByTaskId(taskId);
        log.info("Task updated: taskId={}", taskId);
        return toResponse(task, docCount);
    }

    /**
     * 과제 삭제
     */
    public void deleteTask(String taskId) {
        taskDocumentRepository.deleteByTaskId(taskId);
        ableTaskRepository.deleteById(taskId);
        log.info("Task deleted: taskId={}", taskId);
    }

    /**
     * 프로젝트 요약 통계
     */
    public TaskSummaryResponse getSummary(String projectId) {
        List<AbleTask> tasks = ableTaskRepository.findByProjectId(projectId);

        long totalTasks = tasks.size();
        double totalBaseAmount = tasks.stream()
                .mapToDouble(t -> t.getBaseAmount() != null ? t.getBaseAmount() : 0.0)
                .sum();
        double totalSavingAmount = tasks.stream()
                .mapToDouble(t -> t.getExpectedSavingAmount() != null ? t.getExpectedSavingAmount() : 0.0)
                .sum();
        int avgProgress = tasks.isEmpty() ? 0
                : (int) Math.round(tasks.stream()
                    .mapToInt(t -> t.getProgress() != null ? t.getProgress() : 0)
                    .average().orElse(0));

        List<AbleTask> completedTasks = tasks.stream()
                .filter(t -> "완료".equals(t.getStatus()))
                .toList();
        double totalActualSaving = completedTasks.stream()
                .mapToDouble(t -> t.getActualSaving() != null ? t.getActualSaving() : 0.0)
                .sum();
        double targetSaving = completedTasks.stream()
                .mapToDouble(t -> t.getExpectedSavingAmount() != null ? t.getExpectedSavingAmount() : 0.0)
                .sum();
        double achievementRate = targetSaving > 0 ? (totalActualSaving / targetSaving) * 100 : 0.0;

        return TaskSummaryResponse.builder()
                .totalTasks(totalTasks)
                .totalBaseAmount(totalBaseAmount)
                .totalSavingAmount(totalSavingAmount)
                .avgProgress(avgProgress)
                .completedTasks((long) completedTasks.size())
                .totalActualSaving(totalActualSaving)
                .achievementRate(Math.round(achievementRate * 10.0) / 10.0)
                .build();
    }

    // ===== Document Management =====

    /**
     * 링크 추가
     */
    public TaskDocumentResponse addLink(String taskId, String projectId, AddLinkRequest request) {
        TaskDocument doc = TaskDocument.builder()
                .taskId(taskId)
                .projectId(projectId)
                .type("link")
                .name(request.getUrl())
                .label(request.getLabel() != null && !request.getLabel().isEmpty()
                        ? request.getLabel() : request.getUrl())
                .url(request.getUrl())
                .createdAt(LocalDateTime.now())
                .build();
        doc = taskDocumentRepository.save(doc);
        return toDocResponse(doc);
    }

    /**
     * 파일 업로드 Presigned URL 생성
     */
    public Map<String, String> generateUploadUrl(String taskId, String projectId, String fileName) {
        String uploadId = UUID.randomUUID().toString().substring(0, 8);
        String s3Key = String.format("projects/%s/tasks/%s/documents/%s/%s",
                projectId, taskId, uploadId, fileName);
        String presignedUrl = s3Service.generatePresignedUrl(projectId, taskId, uploadId, fileName);

        // Document 사전 등록 (업로드 완료 전)
        TaskDocument doc = TaskDocument.builder()
                .taskId(taskId)
                .projectId(projectId)
                .type("file")
                .name(fileName)
                .label(fileName)
                .s3Key(s3Key)
                .createdAt(LocalDateTime.now())
                .build();
        doc = taskDocumentRepository.save(doc);

        return Map.of(
                "presignedUrl", presignedUrl,
                "documentId", doc.getId(),
                "s3Key", s3Key
        );
    }

    /**
     * 과제별 문서 목록 조회
     */
    public List<TaskDocumentResponse> getDocuments(String taskId) {
        return taskDocumentRepository.findByTaskId(taskId).stream()
                .map(this::toDocResponse)
                .toList();
    }

    /**
     * 문서 삭제
     */
    public void deleteDocument(String documentId) {
        TaskDocument doc = taskDocumentRepository.findById(documentId)
                .orElseThrow(() -> new RuntimeException("문서를 찾을 수 없습니다: " + documentId));

        if ("file".equals(doc.getType()) && doc.getS3Key() != null) {
            try {
                s3Service.deleteFile(doc.getS3Key());
            } catch (Exception e) {
                log.warn("Failed to delete S3 file: key={}", doc.getS3Key(), e);
            }
        }

        taskDocumentRepository.deleteById(documentId);
        log.info("Document deleted: documentId={}", documentId);
    }

    private TaskResponse toResponse(AbleTask task, int documentCount) {
        List<TaskResponse.ClusterRefDto> clusters = task.getClusters() != null
                ? task.getClusters().stream()
                    .map(c -> TaskResponse.ClusterRefDto.builder()
                            .statisticsId(c.getStatisticsId())
                            .clusterName(c.getClusterName())
                            .accountName(c.getAccountName())
                            .build())
                    .toList()
                : List.of();

        return TaskResponse.builder()
                .id(task.getId())
                .projectId(task.getProjectId())
                .taskName(task.getTaskName())
                .majorAccounts(task.getMajorAccounts())
                .clusters(clusters)
                .department(task.getDepartment())
                .manager(task.getManager())
                .consultant(task.getConsultant())
                .baseAmount(task.getBaseAmount())
                .expectedSavingRate(task.getExpectedSavingRate())
                .expectedSavingAmount(task.getExpectedSavingAmount())
                .progress(task.getProgress())
                .status(task.getStatus())
                .actualSaving(task.getActualSaving())
                .rating(task.getRating())
                .completedAt(task.getCompletedAt())
                .createdAt(task.getCreatedAt())
                .documentCount(documentCount)
                .build();
    }

    private TaskDocumentResponse toDocResponse(TaskDocument doc) {
        return TaskDocumentResponse.builder()
                .id(doc.getId())
                .taskId(doc.getTaskId())
                .type(doc.getType())
                .name(doc.getName())
                .label(doc.getLabel())
                .url(doc.getUrl())
                .createdAt(doc.getCreatedAt())
                .build();
    }
}
