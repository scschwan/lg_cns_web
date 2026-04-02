package com.example.finance.service.costreduction;

import com.example.finance.dto.request.costreduction.AddLinkRequest;
import com.example.finance.dto.request.costreduction.CreateTaskRequest;
import com.example.finance.dto.request.costreduction.CreateWeeklyProgressRequest;
import com.example.finance.dto.request.costreduction.UpdateTaskRequest;
import com.example.finance.dto.response.costreduction.TaskDocumentResponse;
import com.example.finance.dto.response.costreduction.TaskResponse;
import com.example.finance.dto.response.costreduction.TaskSummaryResponse;
import com.example.finance.dto.response.costreduction.WeeklyProgressResponse;
import com.example.finance.model.costreduction.AbleTask;
import com.example.finance.model.costreduction.TaskDocument;
import com.example.finance.model.costreduction.TaskWeeklyProgress;
import com.example.finance.model.data.ClusterStatistics;
import com.example.finance.repository.costreduction.AbleTaskRepository;
import com.example.finance.repository.costreduction.TaskDocumentRepository;
import com.example.finance.repository.costreduction.TaskWeeklyProgressRepository;
import com.example.finance.repository.data.ClusterStatisticsRepository;
import com.example.finance.service.common.S3Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Able Task(원가절감 과제) 서비스
 *
 * 과제 CRUD, 과제별 문서(링크/파일) 관리, 주간 진척 관리,
 * 과제 요약 통계, 과제 초기화 등의 비즈니스 로직을 담당한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AbleTaskService {

    private final AbleTaskRepository ableTaskRepository;
    private final TaskDocumentRepository taskDocumentRepository;
    private final TaskWeeklyProgressRepository weeklyProgressRepository;
    private final ClusterStatisticsRepository clusterStatisticsRepository;
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

        // 클러스터 통계 일괄 조회 및 부모 클러스터명 매핑
        Map<String, ClusterStatistics> statsMap = buildStatsMap(tasks);
        Map<String, String> parentNameMap = buildParentNameMap(statsMap);

        return tasks.stream()
                .map(t -> toResponse(t, docCounts.getOrDefault(t.getId(), 0L).intValue(), statsMap, parentNameMap))
                .toList();
    }

    /**
     * 과제 상세 조회
     */
    public TaskResponse getTask(String taskId) {
        AbleTask task = ableTaskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("과제를 찾을 수 없습니다: " + taskId));
        int docCount = (int) taskDocumentRepository.countByTaskId(taskId);

        Map<String, ClusterStatistics> statsMap = buildStatsMap(List.of(task));
        Map<String, String> parentNameMap = buildParentNameMap(statsMap);

        return toResponse(task, docCount, statsMap, parentNameMap);
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
        if (request.getProgressDetails() != null) task.setProgressDetails(request.getProgressDetails());
        if (request.getIssues() != null) task.setIssues(request.getIssues());
        if (request.getCustomerFollowUp() != null) task.setCustomerFollowUp(request.getCustomerFollowUp());
        if (request.getActionItems() != null) task.setActionItems(request.getActionItems());

        task.setUpdatedAt(LocalDateTime.now());
        task = ableTaskRepository.save(task);

        int docCount = (int) taskDocumentRepository.countByTaskId(taskId);
        log.info("Task updated: taskId={}", taskId);
        return toResponse(task, docCount);
    }

    /**
     * 완료 과제 초기화 (진행률 0%, 상태 "진행 중"으로 되돌리기)
     */
    public TaskResponse resetTask(String taskId) {
        AbleTask task = ableTaskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("과제를 찾을 수 없습니다: " + taskId));

        task.setProgress(0);
        task.setStatus("진행 중");
        task.setActualSaving(null);
        task.setRating(null);
        task.setCompletedAt(null);
        task.setUpdatedAt(LocalDateTime.now());
        task = ableTaskRepository.save(task);

        int docCount = (int) taskDocumentRepository.countByTaskId(taskId);
        log.info("Task reset: taskId={}", taskId);
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

    /**
     * 프로젝트의 모든 과제에서 사용 중인 statisticsId 목록 조회 (잠금 처리용)
     */
    public List<String> getLockedStatisticsIds(String projectId) {
        List<AbleTask> tasks = ableTaskRepository.findByProjectId(projectId);
        return tasks.stream()
                .flatMap(t -> t.getClusters() != null ? t.getClusters().stream() : java.util.stream.Stream.empty())
                .map(AbleTask.ClusterRef::getStatisticsId)
                .filter(id -> id != null && !id.isEmpty())
                .distinct()
                .toList();
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
        String presignedUrl = s3Service.generatePresignedUploadUrl(s3Key);

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
     * 파일 다운로드 Presigned URL 생성
     */
    public String getDocumentDownloadUrl(String documentId) {
        TaskDocument doc = taskDocumentRepository.findById(documentId)
                .orElseThrow(() -> new RuntimeException("문서를 찾을 수 없습니다: " + documentId));
        if (!"file".equals(doc.getType()) || doc.getS3Key() == null) {
            throw new RuntimeException("다운로드할 수 없는 문서입니다: " + documentId);
        }
        return s3Service.generateDownloadUrl(doc.getS3Key());
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

    // ===== Weekly Progress Management =====

    /**
     * 주차별 진척사항 목록 조회
     */
    public List<WeeklyProgressResponse> getWeeklyProgress(String taskId) {
        return weeklyProgressRepository.findByTaskIdOrderByCreatedAtDesc(taskId).stream()
                .map(this::toWeeklyResponse)
                .toList();
    }

    /**
     * 주차별 진척사항 등록
     */
    public WeeklyProgressResponse createWeeklyProgress(String taskId, String projectId, CreateWeeklyProgressRequest request) {
        TaskWeeklyProgress progress = TaskWeeklyProgress.builder()
                .taskId(taskId)
                .projectId(projectId)
                .weekNumber(request.getWeekNumber())
                .progressDetails(request.getProgressDetails())
                .issues(request.getIssues())
                .author(request.getAuthor())
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        progress = weeklyProgressRepository.save(progress);
        log.info("Weekly progress created: taskId={}, id={}", taskId, progress.getId());
        return toWeeklyResponse(progress);
    }

    /**
     * 주차별 진척사항 수정
     */
    public WeeklyProgressResponse updateWeeklyProgress(String progressId, CreateWeeklyProgressRequest request) {
        TaskWeeklyProgress progress = weeklyProgressRepository.findById(progressId)
                .orElseThrow(() -> new RuntimeException("진척사항을 찾을 수 없습니다: " + progressId));
        if (request.getWeekNumber() != null) progress.setWeekNumber(request.getWeekNumber());
        if (request.getProgressDetails() != null) progress.setProgressDetails(request.getProgressDetails());
        if (request.getIssues() != null) progress.setIssues(request.getIssues());
        if (request.getAuthor() != null) progress.setAuthor(request.getAuthor());
        progress.setUpdatedAt(LocalDateTime.now());
        progress = weeklyProgressRepository.save(progress);
        log.info("Weekly progress updated: id={}", progressId);
        return toWeeklyResponse(progress);
    }

    /**
     * 주차별 진척사항 삭제
     */
    public void deleteWeeklyProgress(String progressId) {
        weeklyProgressRepository.deleteById(progressId);
        log.info("Weekly progress deleted: id={}", progressId);
    }

    /**
     * 과제 목록 Excel 내보내기
     *
     * @param projectId 프로젝트 ID
     * @param statusFilter 상태 필터 (null이면 전체)
     * @return Excel 파일 바이트 배열
     */
    public byte[] exportTasksToExcel(String projectId, String statusFilter) {
        List<AbleTask> tasks = ableTaskRepository.findByProjectId(projectId);

        if (statusFilter != null && !statusFilter.isEmpty()) {
            tasks = tasks.stream()
                    .filter(t -> statusFilter.equals(t.getStatus()))
                    .toList();
        }

        // 클러스터 통계 및 부모 클러스터명 매핑
        Map<String, ClusterStatistics> statsMap = buildStatsMap(tasks);
        Map<String, String> parentNameMap = buildParentNameMap(statsMap);

        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

        try (SXSSFWorkbook workbook = new SXSSFWorkbook(100)) {
            Sheet sheet = workbook.createSheet("과제 목록");

            // 헤더 스타일
            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setBorderBottom(BorderStyle.THIN);

            // 헤더 생성
            String[] headers = {
                    "No", "과제명", "대계정", "클러스터명", "세부클러스터명",
                    "담당부서", "담당자명", "컨설턴트",
                    "모수금액", "절감액", "실제절감액",
                    "진척율(%)", "상태", "등급",
                    "이슈", "진행사항", "고객 후속조치", "실행 항목",
                    "등록시간", "수정시간"
            };

            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            // 데이터 행 생성
            int rowIdx = 1;
            for (AbleTask task : tasks) {
                Row row = sheet.createRow(rowIdx);

                // 클러스터명 / 세부클러스터명 추출
                String clusterNames = "";
                String detailClusterNames = "";
                if (task.getClusters() != null) {
                    List<String> parentNames = new ArrayList<>();
                    List<String> childNames = new ArrayList<>();
                    for (AbleTask.ClusterRef c : task.getClusters()) {
                        ClusterStatistics stat = statsMap.get(c.getStatisticsId());
                        if (stat != null && stat.getLevel() != null && stat.getLevel() == 3) {
                            String parentName = parentNameMap.get(c.getStatisticsId());
                            if (parentName != null && !parentNames.contains(parentName)) {
                                parentNames.add(parentName);
                            }
                            if (c.getClusterName() != null) {
                                childNames.add(c.getClusterName());
                            }
                        } else if (stat != null && stat.getLevel() != null && stat.getLevel() == 2) {
                            if (c.getClusterName() != null && !parentNames.contains(c.getClusterName())) {
                                parentNames.add(c.getClusterName());
                            }
                        }
                    }
                    clusterNames = String.join(", ", parentNames);
                    detailClusterNames = String.join(", ", childNames);
                }

                row.createCell(0).setCellValue(rowIdx);
                row.createCell(1).setCellValue(nullSafe(task.getTaskName()));
                row.createCell(2).setCellValue(task.getMajorAccounts() != null ? String.join(", ", task.getMajorAccounts()) : "");
                row.createCell(3).setCellValue(clusterNames);
                row.createCell(4).setCellValue(detailClusterNames);
                row.createCell(5).setCellValue(nullSafe(task.getDepartment()));
                row.createCell(6).setCellValue(nullSafe(task.getManager()));
                row.createCell(7).setCellValue(nullSafe(task.getConsultant()));
                row.createCell(8).setCellValue(task.getBaseAmount() != null ? task.getBaseAmount() : 0);
                row.createCell(9).setCellValue(task.getExpectedSavingAmount() != null ? task.getExpectedSavingAmount() : 0);
                row.createCell(10).setCellValue(task.getActualSaving() != null ? task.getActualSaving() : 0);
                row.createCell(11).setCellValue(task.getProgress() != null ? task.getProgress() : 0);
                row.createCell(12).setCellValue(nullSafe(task.getStatus()));
                row.createCell(13).setCellValue(nullSafe(task.getRating()));
                row.createCell(14).setCellValue(nullSafe(task.getIssues()));
                row.createCell(15).setCellValue(nullSafe(task.getProgressDetails()));
                row.createCell(16).setCellValue(nullSafe(task.getCustomerFollowUp()));
                row.createCell(17).setCellValue(nullSafe(task.getActionItems()));
                row.createCell(18).setCellValue(task.getCreatedAt() != null ? task.getCreatedAt().format(dtf) : "");
                row.createCell(19).setCellValue(task.getUpdatedAt() != null ? task.getUpdatedAt().format(dtf) : "");

                rowIdx++;
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            workbook.dispose();
            return out.toByteArray();

        } catch (IOException e) {
            log.error("Excel 생성 실패: projectId={}", projectId, e);
            throw new RuntimeException("Excel 파일 생성에 실패했습니다.", e);
        }
    }

    private String nullSafe(String value) {
        return value != null ? value : "";
    }

    private WeeklyProgressResponse toWeeklyResponse(TaskWeeklyProgress p) {
        return WeeklyProgressResponse.builder()
                .id(p.getId())
                .taskId(p.getTaskId())
                .weekNumber(p.getWeekNumber())
                .progressDetails(p.getProgressDetails())
                .issues(p.getIssues())
                .author(p.getAuthor())
                .createdAt(p.getCreatedAt())
                .updatedAt(p.getUpdatedAt())
                .build();
    }

    private TaskResponse toResponse(AbleTask task, int documentCount) {
        return toResponse(task, documentCount, Collections.emptyMap(), Collections.emptyMap());
    }

    /**
     * 모든 과제의 클러스터 statisticsId → ClusterStatistics 매핑 일괄 조회
     */
    private Map<String, ClusterStatistics> buildStatsMap(List<AbleTask> tasks) {
        Set<String> allStatsIds = tasks.stream()
                .filter(t -> t.getClusters() != null)
                .flatMap(t -> t.getClusters().stream())
                .map(AbleTask.ClusterRef::getStatisticsId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (allStatsIds.isEmpty()) return Collections.emptyMap();
        return clusterStatisticsRepository.findAllById(allStatsIds).stream()
                .collect(Collectors.toMap(ClusterStatistics::getId, s -> s, (a, b) -> a));
    }

    /**
     * level 3 클러스터의 부모(level 2) 클러스터명 매핑 생성
     * key: level 3 statisticsId, value: 부모 클러스터명
     */
    private Map<String, String> buildParentNameMap(Map<String, ClusterStatistics> statsMap) {
        // level 3 항목만 추출하여 sessionId + parentClusterNumber 별로 그룹
        Map<String, Set<Integer>> sessionParentNumbers = new HashMap<>();
        List<ClusterStatistics> level3Stats = new ArrayList<>();
        for (ClusterStatistics s : statsMap.values()) {
            if (s.getLevel() != null && s.getLevel() == 3 && s.getParentClusterNumber() != null && s.getSessionId() != null) {
                level3Stats.add(s);
                sessionParentNumbers.computeIfAbsent(s.getSessionId(), k -> new HashSet<>()).add(s.getParentClusterNumber());
            }
        }
        if (level3Stats.isEmpty()) return Collections.emptyMap();

        // 부모 클러스터(level 2) 일괄 조회: sessionId별 level 2 클러스터 조회
        // sessionId → (clusterNumber → clusterName) 매핑
        Map<String, Map<Integer, String>> parentLookup = new HashMap<>();
        for (String sessionId : sessionParentNumbers.keySet()) {
            List<ClusterStatistics> level2Stats = clusterStatisticsRepository.findBySessionIdAndLevel(sessionId, 2);
            Map<Integer, String> numToName = level2Stats.stream()
                    .filter(s -> s.getClusterNumber() != null)
                    .collect(Collectors.toMap(ClusterStatistics::getClusterNumber, ClusterStatistics::getClusterName, (a, b) -> a));
            parentLookup.put(sessionId, numToName);
        }

        // level 3 statisticsId → 부모 클러스터명 매핑
        Map<String, String> result = new HashMap<>();
        for (ClusterStatistics s : level3Stats) {
            Map<Integer, String> numToName = parentLookup.getOrDefault(s.getSessionId(), Collections.emptyMap());
            String parentName = numToName.get(s.getParentClusterNumber());
            if (parentName != null) {
                result.put(s.getId(), parentName);
            }
        }
        return result;
    }

    private TaskResponse toResponse(AbleTask task, int documentCount, Map<String, ClusterStatistics> statsMap, Map<String, String> parentNameMap) {
        List<TaskResponse.ClusterRefDto> clusters = task.getClusters() != null
                ? task.getClusters().stream()
                    .map(c -> {
                        ClusterStatistics stat = statsMap.get(c.getStatisticsId());
                        return TaskResponse.ClusterRefDto.builder()
                            .statisticsId(c.getStatisticsId())
                            .clusterName(c.getClusterName())
                            .accountName(c.getAccountName())
                            .level(stat != null ? stat.getLevel() : null)
                            .parentClusterName(parentNameMap.get(c.getStatisticsId()))
                            .build();
                    })
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
                .progressDetails(task.getProgressDetails())
                .issues(task.getIssues())
                .customerFollowUp(task.getCustomerFollowUp())
                .actionItems(task.getActionItems())
                .completedAt(task.getCompletedAt())
                .createdAt(task.getCreatedAt())
                .updatedAt(task.getUpdatedAt())
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
