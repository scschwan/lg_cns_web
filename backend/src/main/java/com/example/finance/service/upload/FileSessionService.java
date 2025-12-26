package com.example.finance.service.upload;

import com.example.finance.dto.request.upload.CreateFileSessionRequest;
import com.example.finance.dto.request.upload.MergeSessionsRequest;
import com.example.finance.dto.request.upload.SetFileColumnsRequest;
import com.example.finance.dto.request.upload.UpdateFileSessionRequest;
import com.example.finance.dto.response.fileload.SessionCompleteResponse;
import com.example.finance.dto.response.fileload.SessionCompleteStatusResponse;
import com.example.finance.dto.response.session.FileSessionResponse;
import com.example.finance.dto.response.upload.AccountPartitionResponse;
import com.example.finance.enums.ProcessStep;
import com.example.finance.exception.BusinessException;
import com.example.finance.exception.ProjectNotFoundException;
import com.example.finance.model.session.FileSession;
import com.example.finance.model.project.Project;
import com.example.finance.model.session.StepHistory;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.model.upload.UploadSession;
import com.example.finance.repository.data.ClusteringResultRepository;
import com.example.finance.repository.data.ProcessDataRepository;
import com.example.finance.repository.data.RawDataRepository;
import com.example.finance.repository.project.ProjectRepository;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.repository.upload.UploadSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;


import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 파일 세션 서비스
 *
 * Phase 2.1: Multi File Upload & Session Management
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileSessionService {

    private final FileSessionRepository fileSessionRepository;
    private final ProjectRepository projectRepository;
    private final UploadSessionRepository uploadSessionRepository;
    private final RawDataRepository rawDataRepository;
    private final ProcessDataRepository processDataRepository;
    private final ClusteringResultRepository clusteringResultRepository;

    // 클래스 상단에 추가
    private final MongoTemplate mongoTemplate;
    private final ObjectMapper objectMapper;
    private final SqsClient sqsClient;
    private final StringRedisTemplate redisTemplate;

    @Value("${aws.sqs.excel-queue-url}")
    private String sqsQueueUrl;

    /**
     * 세션 완료 처리 (계정 분석 시작)
     *
     * C# SessionDataProcessor.ProcessFullWorkflowAsync() 재현
     */
    @Transactional
    public SessionCompleteResponse completeSession(
            String projectId,
            String sessionId,
            String userId) {

        log.info("⭐ 세션 완료 처리 시작: sessionId={}", sessionId);

        // 1. 세션 조회
        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        // 2. 프로젝트 ID 검증
        if (!fileSession.getProjectId().equals(projectId)) {
            throw new BusinessException(
                    "INVALID_PROJECT", "프로젝트 ID가 일치하지 않습니다");
        }

        // 3. 권한 검증
        if (!fileSession.getCreatedBy().equals(userId)) {
            throw new BusinessException(
                    "FORBIDDEN", "세션에 대한 권한이 없습니다");
        }

        // 4. 이미 완료된 세션 확인
        if (Boolean.TRUE.equals(fileSession.getIsCompleted())) {
            log.warn("이미 완료된 세션: sessionId={}", sessionId);
            throw new BusinessException(
                    "SESSION_ALREADY_COMPLETED", "이미 완료된 세션입니다");
        }

        // 5. Redis 진행률 초기화
        String progressKey = "session:complete:" + sessionId;
        initializeProgress(progressKey);

        try {
            // 6. raw_data 컬렉션 초기화
            log.info("⭐ Step 1: raw_data 컬렉션 초기화 시작");
            updateProgress(progressKey, 10, "raw_data 컬렉션 초기화 중...");
            clearRawDataCollection(sessionId);

            // 7. process_data 컬렉션 초기화
            log.info("⭐ Step 2: process_data 컬렉션 초기화 시작");
            updateProgress(progressKey, 20, "process_data 컬렉션 초기화 중...");
            clearProcessDataCollection(sessionId);

            // 8. 세션 파일 목록 조회
            log.info("⭐ Step 3: 세션 파일 목록 조회");
            updateProgress(progressKey, 30, "파일 목록 조회 중...");

            List<UploadedFileInfo> files = fileSession.getUploadedFiles();
            log.info("파일 목록 조회 완료: {} files", files.size());

            // 9. Lambda 병렬 처리 트리거
            log.info("⭐ Step 4: Lambda 병렬 처리 시작 ({} files)", files.size());
            updateProgress(progressKey, 40, "Lambda 병렬 처리 시작...");

            int totalProcessedRows = 0;
            int processedFileCount = 0;

            for (int i = 0; i < files.size(); i++) {
                UploadedFileInfo fileInfo = files.get(i);
                int fileProgress = 40 + ((i + 1) * 50 / files.size());

                updateProgress(progressKey, fileProgress,
                        String.format("파일 처리 중... (%d/%d): %s",
                                i + 1, files.size(), fileInfo.getFileName()));

                // Lambda Coordinator 호출 (SQS 메시지 발행)
                int rowCount = triggerLambdaRawDataInsert(
                        sessionId,
                        fileInfo
                );

                totalProcessedRows += rowCount;
                processedFileCount++;

                log.info("파일 처리 완료: file={}, rows={}",
                        fileInfo.getFileName(), rowCount);
            }

            // 10. 세션 완료 상태 업데이트
            log.info("⭐ Step 5: 세션 상태 업데이트");
            updateProgress(progressKey, 90, "세션 상태 업데이트 중...");

            fileSession.setIsCompleted(true);
            fileSession.setCompletedAt(LocalDateTime.now());
            fileSession.setUpdatedAt(LocalDateTime.now());
            fileSessionRepository.save(fileSession);

            // 11. Redis 진행률 완료
            updateProgress(progressKey, 100, "완료");

            log.info("⭐ 세션 완료 처리 성공: sessionId={}, files={}, rows={}",
                    sessionId, processedFileCount, totalProcessedRows);

            return SessionCompleteResponse.builder()
                    .sessionId(sessionId)
                    .success(true)
                    .processedFileCount(processedFileCount)
                    .processedRowCount(totalProcessedRows)
                    .message("세션 완료 처리가 성공적으로 완료되었습니다.")
                    .build();

        } catch (Exception e) {
            log.error("⭐ 세션 완료 처리 실패: sessionId={}, error={}",
                    sessionId, e.getMessage(), e);

            // 실패 상태 업데이트
            updateProgress(progressKey, -1, "오류: " + e.getMessage());

            throw new BusinessException(
                    "SESSION_COMPLETE_FAILED",
                    "세션 완료 처리 중 오류 발생: " + e.getMessage());
        }
    }

    /**
     * raw_data 컬렉션 초기화 (해당 세션만)
     */
    private void clearRawDataCollection(String sessionId) {
        try {
            Query query = new Query(Criteria.where("sessionId").is(sessionId));
            long deletedCount = mongoTemplate.remove(query, "raw_data").getDeletedCount();

            log.info("raw_data 컬렉션 초기화 완료: sessionId={}, deleted={}",
                    sessionId, deletedCount);
        } catch (Exception e) {
            log.error("raw_data 컬렉션 초기화 실패: {}", e.getMessage(), e);
            throw new BusinessException(
                    "RAW_DATA_CLEAR_FAILED", "raw_data 컬렉션 초기화 실패");
        }
    }

    /**
     * process_data 컬렉션 초기화 (해당 세션만)
     */
    private void clearProcessDataCollection(String sessionId) {
        try {
            Query query = new Query(Criteria.where("sessionId").is(sessionId));
            long deletedCount = mongoTemplate.remove(query, "process_data").getDeletedCount();

            log.info("process_data 컬렉션 초기화 완료: sessionId={}, deleted={}",
                    sessionId, deletedCount);
        } catch (Exception e) {
            log.error("process_data 컬렉션 초기화 실패: {}", e.getMessage(), e);
            // process_data 초기화 실패는 치명적이지 않으므로 로그만 남김
        }
    }

    /**
     * Lambda raw_data Insert 트리거 (SQS 메시지 발행)
     */
    private int triggerLambdaRawDataInsert(
            String sessionId,
            UploadedFileInfo fileInfo) {

        try {
            log.info("⭐ Lambda raw_data Insert 트리거: file={}, account={}",
                    fileInfo.getFileName(), fileInfo.getAccountColumnName());

            // SQS 메시지 생성
            Map<String, Object> message = new HashMap<>();
            message.put("operation", "RAW_DATA_INSERT");  // ⭐ 작업 구분
            message.put("sessionId", sessionId);
            message.put("fileId", fileInfo.getFileId());
            message.put("s3Bucket", "finance-excel-uploads");
            message.put("s3Key", fileInfo.getS3Key());
            message.put("fileName", fileInfo.getFileName());
            message.put("accountColumnName", fileInfo.getAccountColumnName());
            message.put("amountColumnName", fileInfo.getAmountColumnName());
            message.put("accountContents", fileInfo.getAccountContents()); // ⭐ 계정명 필터

            String messageBody = objectMapper.writeValueAsString(message);

            // SQS 메시지 발행
            SendMessageRequest request = SendMessageRequest.builder()
                    .queueUrl(sqsQueueUrl)
                    .messageBody(messageBody)
                    .build();

            sqsClient.sendMessage(request);

            log.info("SQS 메시지 발행 완료: file={}", fileInfo.getFileName());

            // 예상 행 수 반환
            return estimateRowCount(fileInfo);

        } catch (Exception e) {
            log.error("Lambda 트리거 실패: file={}, error={}",
                    fileInfo.getFileName(), e.getMessage(), e);
            throw new BusinessException(
                    "LAMBDA_TRIGGER_FAILED", "Lambda 트리거 실패");
        }
    }

    /**
     * 파일 크기 기반 행 수 예상
     */
    private int estimateRowCount(UploadedFileInfo fileInfo) {
        // 평균 행당 크기: 500 bytes
        long estimatedRows = fileInfo.getFileSize() / 500;
        return (int) Math.min(estimatedRows, Integer.MAX_VALUE);
    }

    /**
     * Redis 진행률 초기화
     */
    private void initializeProgress(String progressKey) {
        Map<String, String> progressData = new HashMap<>();
        progressData.put("status", "PROCESSING");
        progressData.put("progress", "0");
        progressData.put("message", "세션 완료 처리 시작...");
        progressData.put("startTime", String.valueOf(System.currentTimeMillis()));

        redisTemplate.opsForHash().putAll(progressKey, progressData);
        redisTemplate.expire(progressKey, 24, TimeUnit.HOURS);
    }

    /**
     * Redis 진행률 업데이트
     */
    private void updateProgress(String progressKey, int progress, String message) {
        try {
            redisTemplate.opsForHash().put(progressKey, "progress", String.valueOf(progress));
            redisTemplate.opsForHash().put(progressKey, "message", message);
            redisTemplate.opsForHash().put(progressKey, "updateTime",
                    String.valueOf(System.currentTimeMillis()));

            if (progress >= 100) {
                redisTemplate.opsForHash().put(progressKey, "status", "COMPLETED");
            } else if (progress < 0) {
                redisTemplate.opsForHash().put(progressKey, "status", "FAILED");
            }

            log.debug("진행률 업데이트: progress={}%, message={}", progress, message);
        } catch (Exception e) {
            log.warn("진행률 업데이트 실패: {}", e.getMessage());
        }
    }

    /**
     * 세션 완료 처리 진행률 조회
     */
    public SessionCompleteStatusResponse getCompleteStatus(
            String projectId,
            String sessionId) {

        String progressKey = "session:complete:" + sessionId;

        Map<Object, Object> progressData = redisTemplate.opsForHash().entries(progressKey);

        if (progressData.isEmpty()) {
            return SessionCompleteStatusResponse.builder()
                    .status("NOT_STARTED")
                    .progress(0)
                    .message("세션 완료 처리가 시작되지 않았습니다.")
                    .build();
        }

        return SessionCompleteStatusResponse.builder()
                .status((String) progressData.getOrDefault("status", "PROCESSING"))
                .progress(Integer.parseInt((String) progressData.getOrDefault("progress", "0")))
                .message((String) progressData.getOrDefault("message", ""))
                .build();
    }

    /**
     * 파일 세션 생성
     *
     * @param userId 사용자 ID
     * @param request 세션 생성 요청
     * @return 생성된 세션
     */
    @Transactional
    public FileSession createFileSession(String userId, CreateFileSessionRequest request) {
        log.info("파일 세션 생성: userId={}, projectId={}, sessionName={}",
                userId, request.getProjectId(), request.getSessionName());

        // 1. 프로젝트 존재 확인
        Project project = projectRepository.findByProjectId(request.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // 2. 프로젝트 멤버 확인
        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("프로젝트에 접근할 권한이 없습니다");
        }

        // 3. 세션명 중복 확인
        if (fileSessionRepository.existsByProjectIdAndSessionNameAndIsDeletedFalse(
                request.getProjectId(), request.getSessionName())) {
            throw new RuntimeException("이미 존재하는 세션명입니다");
        }

        // 4. 선택한 파일들의 메타데이터 조회
        List<UploadSession> uploadSessions = uploadSessionRepository
                .findAllById(request.getFileIds());

        if (uploadSessions.size() != request.getFileIds().size()) {
            throw new RuntimeException("일부 파일을 찾을 수 없습니다");
        }

        // 5. UploadedFileInfo 생성
        List<UploadedFileInfo> uploadedFiles = uploadSessions.stream()
                .map(us -> UploadedFileInfo.builder()
                        .fileId(us.getId())
                        .fileName(us.getFileName())
                        .fileSize(us.getFileSize())
                        .s3Key(us.getS3Key())
                        .rowCount(us.getTotalRows() != null ? us.getTotalRows().longValue() : 0L)
                        .uploadedAt(us.getCreatedAt())
                        .detectedColumns(new ArrayList<>())  // Lambda에서 추출된 컬럼 정보
                        .accountContents(new ArrayList<>())
                        .build())
                .collect(Collectors.toList());

        // 6. 통계 계산
        long totalRowCount = uploadedFiles.stream()
                .mapToLong(UploadedFileInfo::getRowCount)
                .sum();

        // 7. FileSession 생성
        FileSession fileSession = FileSession.builder()
                .sessionId(UUID.randomUUID().toString())
                .projectId(request.getProjectId())
                .sessionName(request.getSessionName())
                .workerName(request.getWorkerName() != null ? request.getWorkerName() : "")
                .createdBy(userId)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .lastAccessedAt(LocalDateTime.now())
                .uploadedFiles(uploadedFiles)
                .totalFiles(uploadedFiles.size())
                .totalRowCount(totalRowCount)
                .totalAmount(0L)
                .currentStep(null)
                .progressPercentage(0)
                .stepHistory(new ArrayList<>())
                .isCompleted(false)
                .accountNames(new ArrayList<>())
                .accountColumnNames(new ArrayList<>())
                .isDeleted(false)
                .build();

        fileSession = fileSessionRepository.save(fileSession);

        // 8. 프로젝트 세션 수 업데이트
        project.setTotalSessions(project.getTotalSessions() + 1);
        project.setTotalFiles(project.getTotalFiles() + uploadedFiles.size());
        project.setUpdatedAt(LocalDateTime.now());
        projectRepository.save(project);

        log.info("파일 세션 생성 완료: sessionId={}", fileSession.getSessionId());

        return fileSession;
    }

    /**
     * 세션 정보 수정 (세션명, 작업자명)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @param request 수정 요청
     * @return 업데이트된 세션
     */
    @Transactional
    public FileSession updateFileSession(String sessionId, String userId,
                                         UpdateFileSessionRequest request) {
        log.info("세션 정보 수정: sessionId={}", sessionId);

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인 (프로젝트 멤버인지)
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 수정할 권한이 없습니다");
        }

        // 수정
        if (request.getSessionName() != null) {
            fileSession.setSessionName(request.getSessionName());
        }
        if (request.getWorkerName() != null) {
            fileSession.setWorkerName(request.getWorkerName());
        }

        fileSession.setUpdatedAt(LocalDateTime.now());

        return fileSessionRepository.save(fileSession);
    }

    /**
     * 파일 컬럼 설정 (계정명, 금액 컬럼)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @param request 컬럼 설정 요청
     * @return 업데이트된 세션
     */
    @Transactional
    public FileSession setFileColumns(String sessionId, String userId,
                                      SetFileColumnsRequest request) {
        log.info("파일 컬럼 설정: sessionId={}, fileId={}", sessionId, request.getFileId());

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 수정할 권한이 없습니다");
        }

        // 파일 찾아서 컬럼 설정
        UploadedFileInfo targetFile = fileSession.getUploadedFiles().stream()
                .filter(f -> f.getFileId().equals(request.getFileId()))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("파일을 찾을 수 없습니다"));

        targetFile.setAccountColumnName(request.getAccountColumnName());
        targetFile.setAmountColumnName(request.getAmountColumnName());

        // 계정명 컬럼 목록에 추가 (중복 제거)
        if (!fileSession.getAccountColumnNames().contains(request.getAccountColumnName())) {
            fileSession.getAccountColumnNames().add(request.getAccountColumnName());
        }

        fileSession.setUpdatedAt(LocalDateTime.now());

        return fileSessionRepository.save(fileSession);
    }

    /**
     * 프로젝트 세션 목록 조회
     *
     * @param projectId 프로젝트 ID
     * @param userId 사용자 ID
     * @return 세션 목록
     */
    public List<FileSessionResponse> getProjectSessions(String projectId, String userId) {
        log.info("프로젝트 세션 목록 조회: projectId={}", projectId);

        // 권한 확인
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("프로젝트에 접근할 권한이 없습니다");
        }

        // 세션 조회
        List<FileSession> sessions = fileSessionRepository
                .findByProjectIdAndIsDeletedFalseOrderByCreatedAtDesc(projectId);

        return sessions.stream()
                .map(this::toFileSessionResponse)
                .collect(Collectors.toList());
    }

    /**
     * 세션 상세 조회
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @return 세션 상세
     */
    public FileSessionResponse getFileSession(String sessionId, String userId) {
        log.info("세션 상세 조회: sessionId={}", sessionId);

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션에 접근할 권한이 없습니다");
        }

        // 마지막 접근 시간 업데이트
        fileSession.setLastAccessedAt(LocalDateTime.now());
        fileSessionRepository.save(fileSession);

        return toFileSessionResponseWithDetails(fileSession);
    }

    /**
     * 세션 시작 (Step 2 진입)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @return 업데이트된 세션
     */
    @Transactional
    public FileSession startSession(String sessionId, String userId) {
        log.info("세션 시작: sessionId={}", sessionId);

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 시작할 권한이 없습니다");
        }

        // Step 2 (FileLoad) 진입
        fileSession.setCurrentStep(ProcessStep.FILE_LOAD);
        fileSession.setProgressPercentage(0);

        StepHistory stepHistory = StepHistory.builder()
                .step(ProcessStep.FILE_LOAD)
                .startedAt(LocalDateTime.now())
                .status("in_progress")
                .build();

        fileSession.getStepHistory().add(stepHistory);
        fileSession.setUpdatedAt(LocalDateTime.now());

        return fileSessionRepository.save(fileSession);
    }

    /**
     * 세션 초기화 (모든 데이터 삭제)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     */
    @Transactional
    public void resetSession(String sessionId, String userId) {
        log.info("세션 초기화: sessionId={}", sessionId);

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 초기화할 권한이 없습니다");
        }

        String projectId = fileSession.getProjectId();

        // 1. raw_data 삭제
        rawDataRepository.deleteByProjectIdAndSessionId(projectId, sessionId);
        log.info("raw_data 삭제 완료");

        // 2. process_data 삭제
        processDataRepository.deleteByProjectIdAndSessionId(projectId, sessionId);
        log.info("process_data 삭제 완료");

        // 3. clustering_results 삭제
        clusteringResultRepository.deleteByProjectIdAndSessionId(projectId, sessionId);
        log.info("clustering_results 삭제 완료");

        // 4. 세션 상태 초기화
        fileSession.setCurrentStep(null);
        fileSession.setProgressPercentage(0);
        fileSession.setIsCompleted(false);
        fileSession.setCompletedAt(null);
        fileSession.setExportPath(null);
        fileSession.getStepHistory().clear();
        fileSession.setUpdatedAt(LocalDateTime.now());

        fileSessionRepository.save(fileSession);

        log.info("세션 초기화 완료");
    }

    /**
     * 세션 삭제 (소프트 삭제)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     */
    @Transactional
    public void deleteSession(String sessionId, String userId) {
        log.info("세션 삭제: sessionId={}", sessionId);

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 삭제할 권한이 없습니다");
        }

        // 소프트 삭제
        fileSession.setIsDeleted(true);
        fileSession.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(fileSession);

        // 프로젝트 세션 수 업데이트
        project.setTotalSessions(project.getTotalSessions() - 1);
        if (fileSession.getIsCompleted()) {
            project.setCompletedSessions(project.getCompletedSessions() - 1);
        }
        project.setUpdatedAt(LocalDateTime.now());
        projectRepository.save(project);

        log.info("세션 삭제 완료");
    }

    /**
     * 세션 병합
     *
     * @param userId 사용자 ID
     * @param request 병합 요청
     * @return 새로 생성된 병합 세션
     */
    @Transactional
    public FileSession mergeSessions(String userId, MergeSessionsRequest request) {
        log.info("세션 병합: sessionIds={}", request.getSessionIds());

        // 1. 모든 세션 조회
        List<FileSession> sessions = request.getSessionIds().stream()
                .map(sessionId -> fileSessionRepository.findBySessionId(sessionId)
                        .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다: " + sessionId)))
                .collect(Collectors.toList());

        // 2. 같은 프로젝트인지 확인
        String projectId = sessions.get(0).getProjectId();
        boolean sameProject = sessions.stream()
                .allMatch(s -> s.getProjectId().equals(projectId));

        if (!sameProject) {
            throw new RuntimeException("다른 프로젝트의 세션은 병합할 수 없습니다");
        }

        // 3. 권한 확인
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 병합할 권한이 없습니다");
        }

        // 4. 모든 파일 정보 병합
        List<UploadedFileInfo> allFiles = sessions.stream()
                .flatMap(s -> s.getUploadedFiles().stream())
                .collect(Collectors.toList());

        // 5. 통계 계산
        long totalRowCount = allFiles.stream()
                .mapToLong(UploadedFileInfo::getRowCount)
                .sum();

        // 6. 계정명 컬럼 병합
        List<String> accountColumnNames = sessions.stream()
                .flatMap(s -> s.getAccountColumnNames().stream())
                .distinct()
                .collect(Collectors.toList());

        // 7. 새 세션 생성
        FileSession mergedSession = FileSession.builder()
                .sessionId(UUID.randomUUID().toString())
                .projectId(projectId)
                .sessionName(request.getNewSessionName())
                .workerName(request.getWorkerName() != null ? request.getWorkerName() : "")
                .createdBy(userId)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .lastAccessedAt(LocalDateTime.now())
                .uploadedFiles(allFiles)
                .totalFiles(allFiles.size())
                .totalRowCount(totalRowCount)
                .totalAmount(0L)
                .currentStep(null)
                .progressPercentage(0)
                .stepHistory(new ArrayList<>())
                .isCompleted(false)
                .accountNames(new ArrayList<>())
                .accountColumnNames(accountColumnNames)
                .isDeleted(false)
                .build();

        mergedSession = fileSessionRepository.save(mergedSession);

        log.info("세션 병합 완료: newSessionId={}", mergedSession.getSessionId());

        return mergedSession;
    }

    /**
     * FileSession → FileSessionResponse 변환 (기본)
     */
    private FileSessionResponse toFileSessionResponse(FileSession session) {
        return FileSessionResponse.builder()
                .sessionId(session.getSessionId())
                .projectId(session.getProjectId())
                .sessionName(session.getSessionName())
                .workerName(session.getWorkerName())
                .totalFiles(session.getTotalFiles())
                .totalRowCount(session.getTotalRowCount())
                .totalAmount(session.getTotalAmount())
                .currentStep(session.getCurrentStep())
                .progressPercentage(session.getProgressPercentage())
                .isCompleted(session.getIsCompleted())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .lastAccessedAt(session.getLastAccessedAt())
                .completedAt(session.getCompletedAt())
                .build();
    }

    /**
     * FileSession → FileSessionResponse 변환 (상세)
     */
    private FileSessionResponse toFileSessionResponseWithDetails(FileSession session) {
        return FileSessionResponse.builder()
                .sessionId(session.getSessionId())
                .projectId(session.getProjectId())
                .sessionName(session.getSessionName())
                .workerName(session.getWorkerName())
                .totalFiles(session.getTotalFiles())
                .totalRowCount(session.getTotalRowCount())
                .totalAmount(session.getTotalAmount())
                .currentStep(session.getCurrentStep())
                .progressPercentage(session.getProgressPercentage())
                .isCompleted(session.getIsCompleted())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .lastAccessedAt(session.getLastAccessedAt())
                .completedAt(session.getCompletedAt())
                .uploadedFiles(session.getUploadedFiles())
                .stepHistory(session.getStepHistory())
                .build();
    }

    /**
     * 세션에 파일 추가
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @param fileIds 추가할 파일 ID 리스트
     * @return 업데이트된 세션
     */
    public FileSession addFilesToSession(String sessionId, String userId, List<String> fileIds) {
        log.info("세션에 파일 추가: sessionId={}, fileIds={}", sessionId, fileIds);

        // 1. 세션 조회
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        // 2. 권한 확인
        if (!session.getCreatedBy().equals(userId)) {
            throw new BusinessException("FORBIDDEN", "세션 접근 권한이 없습니다");
        }

        // 3. 파일 정보 조회 및 추가
        for (String fileId : fileIds) {
            // 다른 세션에서 파일 정보 조회
            FileSession sourceSession = fileSessionRepository.findByUploadedFilesFileId(fileId)
                    .orElseThrow(() -> new BusinessException(
                            "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

            UploadedFileInfo fileInfo = sourceSession.getUploadedFiles().stream()
                    .filter(f -> f.getFileId().equals(fileId))
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(
                            "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

            // 중복 체크
            boolean alreadyExists = session.getUploadedFiles().stream()
                    .anyMatch(f -> f.getFileId().equals(fileId));

            if (!alreadyExists) {
                session.getUploadedFiles().add(fileInfo);
            }
        }

        // 4. 세션 업데이트
        session.setUpdatedAt(LocalDateTime.now());
        FileSession updated = fileSessionRepository.save(session);

        log.info("세션에 파일 추가 완료: {} 개 파일 추가됨", fileIds.size());
        return updated;
    }

    /**
     * 파티션 기반 세션 일괄 생성
     *
     * @param userId 사용자 ID
     * @param projectId 프로젝트 ID
     * @param partitions 파티션 정보 목록
     * @return 생성된 세션 응답 목록
     */
    @Transactional
    public List<FileSessionResponse> createSessionsFromPartitions(
            String userId,
            String projectId,
            List<AccountPartitionResponse> partitions) {

        log.info("⭐ 파티션 기반 세션 일괄 생성 시작: userId={}, projectId={}, partitions={}",
                userId, projectId, partitions.size());

        // 1. 프로젝트 조회 및 권한 확인
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("프로젝트에 접근할 권한이 없습니다");
        }

        List<FileSessionResponse> createdSessions = new ArrayList<>();
        int sessionCounter = 1;  // ⭐ 세션 번호 카운터

        // 2. 각 파티션별로 세션 생성
        for (AccountPartitionResponse partition : partitions) {
            try {
                log.info("파티션 처리 중: accountName={}, fileIds={}",
                        partition.getAccountName(), partition.getFileIds());

                // 2-1. FileSession에서 파일 정보 조회 (UploadedFileInfo 추출)
                List<UploadedFileInfo> uploadedFiles = new ArrayList<>();

                for (String fileId : partition.getFileIds()) {
                    // FileSession에서 fileId로 파일 찾기
                    Optional<FileSession> sessionOpt = fileSessionRepository.findByUploadedFilesFileId(fileId);

                    if (sessionOpt.isPresent()) {
                        FileSession existingSession = sessionOpt.get();
                        UploadedFileInfo fileInfo = existingSession.getUploadedFiles().stream()
                                .filter(f -> f.getFileId().equals(fileId))
                                .findFirst()
                                .orElse(null);

                        if (fileInfo != null) {
                            uploadedFiles.add(fileInfo);
                        } else {
                            log.warn("파일 정보를 찾을 수 없음: fileId={}", fileId);
                        }
                    } else {
                        log.warn("FileSession을 찾을 수 없음: fileId={}", fileId);
                    }
                }

                if (uploadedFiles.isEmpty()) {
                    log.warn("업로드된 파일이 없습니다: accountName={}", partition.getAccountName());
                    continue;
                }

                // 2-2. 통계 계산
                long totalRowCount = uploadedFiles.stream()
                        .mapToLong(f -> f.getRowCount() != null ? f.getRowCount() : 0L)
                        .sum();

                long totalAmount = partition.getTotalAmount() != null ?
                        partition.getTotalAmount().longValue() : 0L;

                // 2-3. 세션명 생성 (기본값: 계정명_session_1, 계정명_session_2, ...)
                String sessionName = partition.getSessionName() != null && !partition.getSessionName().isEmpty()
                        ? partition.getSessionName()
                        : String.format("%s_session_%d", partition.getAccountName(), sessionCounter++);

                // 2-4. FileSession 생성
                FileSession session = FileSession.builder()
                        .sessionId(UUID.randomUUID().toString())
                        .projectId(projectId)
                        .sessionName(sessionName)  // ⭐ 기본값 적용
                        .workerName(partition.getWorkerName() != null ? partition.getWorkerName() : "")
                        .createdBy(userId)
                        .createdAt(LocalDateTime.now())
                        .updatedAt(LocalDateTime.now())
                        .lastAccessedAt(LocalDateTime.now())
                        .uploadedFiles(uploadedFiles)
                        .totalFiles(uploadedFiles.size())
                        .totalRowCount(totalRowCount)
                        .totalAmount(totalAmount)
                        .currentStep(null)
                        .progressPercentage(0)
                        .stepHistory(new ArrayList<>())
                        .isCompleted(false)
                        .accountNames(Arrays.asList(partition.getAccountName()))  // ⭐ List로 추가
                        .accountColumnNames(new ArrayList<>())
                        .isDeleted(false)
                        .build();

                // 2-5. MongoDB 저장
                session = fileSessionRepository.save(session);

                // 2-6. 응답 DTO 생성 (⭐ 파일 정보 포함)
                FileSessionResponse response = FileSessionResponse.builder()
                        .sessionId(session.getSessionId())
                        .projectId(session.getProjectId())
                        .sessionName(session.getSessionName())
                        .workerName(session.getWorkerName())
                        .totalFiles(session.getTotalFiles())
                        .totalRowCount(session.getTotalRowCount())
                        .totalAmount(session.getTotalAmount())
                        .currentStep(session.getCurrentStep())
                        .progressPercentage(session.getProgressPercentage())
                        .isCompleted(session.getIsCompleted())
                        .createdAt(session.getCreatedAt())
                        .updatedAt(session.getUpdatedAt())
                        .lastAccessedAt(session.getLastAccessedAt())
                        .uploadedFiles(session.getUploadedFiles())  // ⭐ 파일 정보 포함
                        .build();

                createdSessions.add(response);

                log.info("세션 생성 완료: sessionId={}, sessionName={}, accountName={}, files={}",
                        session.getSessionId(), session.getSessionName(),
                        partition.getAccountName(), uploadedFiles.size());

            } catch (Exception e) {
                log.error("세션 생성 실패: accountName={}, error={}",
                        partition.getAccountName(), e.getMessage(), e);
            }
        }

        // 3. 프로젝트 세션 수 업데이트
        if (!createdSessions.isEmpty()) {
            project.setTotalSessions(project.getTotalSessions() + createdSessions.size());
            project.setTotalFiles(project.getTotalFiles() +
                    createdSessions.stream()
                            .mapToInt(s -> s.getTotalFiles() != null ? s.getTotalFiles() : 0)
                            .sum());
            project.setUpdatedAt(LocalDateTime.now());
            projectRepository.save(project);
        }

        log.info("⭐ 파티션 기반 세션 일괄 생성 완료: {} 개", createdSessions.size());

        return createdSessions;
    }
    /**
     * 세션 일괄 삭제
     *
     * @param projectId 프로젝트 ID
     * @param sessionIds 삭제할 세션 ID 리스트
     */
    public void deleteSessions(String projectId, List<String> sessionIds) {
        log.info("세션 일괄 삭제: projectId={}, sessionIds={}", projectId, sessionIds);

        for (String sessionId : sessionIds) {
            FileSession session = fileSessionRepository.findBySessionId(sessionId)
                    .orElseThrow(() -> new BusinessException(
                            "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

            // 프로젝트 확인
            if (!session.getProjectId().equals(projectId)) {
                throw new BusinessException("FORBIDDEN", "프로젝트 세션이 아닙니다");
            }

            // 소프트 삭제
            session.setIsDeleted(true);
            session.setUpdatedAt(LocalDateTime.now());
            fileSessionRepository.save(session);
        }

        log.info("세션 일괄 삭제 완료: {} 개", sessionIds.size());
    }

    /**
     * 세션 완료 처리 (Step 2 진입)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @return 처리 결과
     */
    public Map<String, Object> completeSessionProcessing(String sessionId, String userId) {
        log.info("⭐ 세션 완료 처리: sessionId={}", sessionId);

        // 1. 세션 조회
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        // 2. 권한 확인
        if (!session.getCreatedBy().equals(userId)) {
            throw new BusinessException("FORBIDDEN", "세션 접근 권한이 없습니다");
        }

        // 3. Step 2로 진입 가능한지 확인
        if (session.getUploadedFiles() == null || session.getUploadedFiles().isEmpty()) {
            throw new BusinessException("NO_FILES", "업로드된 파일이 없습니다");
        }

        // ⭐⭐⭐ 4. raw_data 컬렉션 초기화 (신규 추가)
        Query deleteQuery = new Query(Criteria.where("sessionId").is(sessionId));
        long deletedRawData = mongoTemplate.remove(deleteQuery, "raw_data").getDeletedCount();
        log.info("raw_data 초기화 완료: {} 건 삭제", deletedRawData);

        // ⭐⭐⭐ 5. Lambda 병렬 처리 트리거 (신규 추가)
        int processedFileCount = 0;
        for (UploadedFileInfo fileInfo : session.getUploadedFiles()) {
            try {
                // SQS 메시지 발행
                Map<String, Object> message = new HashMap<>();
                message.put("operation", "RAW_DATA_INSERT");
                message.put("sessionId", sessionId);
                message.put("fileId", fileInfo.getFileId());
                message.put("s3Bucket", "finance-excel-uploads");
                message.put("s3Key", fileInfo.getS3Key());
                message.put("fileName", fileInfo.getFileName());
                message.put("accountColumnName", fileInfo.getAccountColumnName());
                message.put("amountColumnName", fileInfo.getAmountColumnName());
                message.put("accountContents", fileInfo.getAccountContents());

                String messageBody = objectMapper.writeValueAsString(message);

                SendMessageRequest request = SendMessageRequest.builder()
                        .queueUrl(sqsQueueUrl)
                        .messageBody(messageBody)
                        .build();

                sqsClient.sendMessage(request);
                processedFileCount++;

                log.info("SQS 메시지 발행 완료: file={}", fileInfo.getFileName());

            } catch (Exception e) {
                log.error("Lambda 트리거 실패: file={}, error={}",
                        fileInfo.getFileName(), e.getMessage(), e);
            }
        }

        // 6. 현재 단계 업데이트
        session.setCurrentStep(ProcessStep.FILE_LOAD);
        session.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(session);

        Map<String, Object> result = new HashMap<>();
        result.put("sessionId", sessionId);
        result.put("currentStep", "FILE_LOAD");
        result.put("fileCount", session.getUploadedFiles().size());
        result.put("processedFileCount", processedFileCount);
        result.put("message", "세션이 Step 2로 진행되었습니다. Lambda 병렬 처리 시작됨");

        log.info("⭐ 세션 완료 처리 완료: sessionId={}, 처리 파일={}",
                sessionId, processedFileCount);

        return result;
    }

    /**
     * 결과 다운로드 URL
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @return Presigned URL
     */
    public String getResultDownloadUrl(String sessionId, String userId) {
        log.info("결과 다운로드 URL 요청: sessionId={}", sessionId);

        // 1. 세션 조회
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        // 2. 권한 확인
        if (!session.getCreatedBy().equals(userId)) {
            throw new BusinessException("FORBIDDEN", "세션 접근 권한이 없습니다");
        }

        // 3. 완료 여부 확인
        if (!session.getIsCompleted()) {
            throw new BusinessException("SESSION_NOT_COMPLETED", "세션이 완료되지 않았습니다");
        }

        // 4. Export 경로 확인
        if (session.getExportPath() == null || session.getExportPath().isEmpty()) {
            throw new BusinessException("NO_EXPORT_FILE", "내보내기 파일이 없습니다");
        }

        // 5. S3 Presigned URL 생성 (GET용)
        // TODO: S3Service에 GET용 Presigned URL 메서드 추가 필요
        String downloadUrl = generateDownloadPresignedUrl(session.getExportPath());

        log.info("다운로드 URL 생성 완료: {}", downloadUrl);
        return downloadUrl;
    }

    /**
     * S3 다운로드 Presigned URL 생성 (헬퍼 메서드)
     *
     * @param s3Key S3 키
     * @return Presigned URL
     */
    private String generateDownloadPresignedUrl(String s3Key) {
        // TODO: S3Service.generateDownloadPresignedUrl() 호출
        // 임시로 s3Key 반환
        return "https://s3.amazonaws.com/" + s3Key;
    }
}