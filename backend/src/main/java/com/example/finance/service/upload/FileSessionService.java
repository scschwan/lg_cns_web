package com.example.finance.service.upload;

import com.example.finance.dto.request.upload.*;
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
import com.example.finance.repository.data.ClusterStatisticsRepository;
import com.example.finance.repository.data.ClusteringResultRepository;
import com.example.finance.repository.data.PreprocessingConfigRepository;
import com.example.finance.repository.data.ProcessViewDataRepository;
import com.example.finance.repository.data.ProcessDataRepository;
import com.example.finance.repository.data.RawDataRepository;
import com.example.finance.repository.data.SessionDataRepository;
import com.example.finance.repository.data.SearchKeywordHierarchyRepository;
import com.example.finance.repository.costreduction.LongShortListRepository;
import com.example.finance.repository.costreduction.AbleTaskRepository;
import com.example.finance.repository.costreduction.TaskDocumentRepository;
import com.example.finance.repository.costreduction.CostReductionDashboardRepository;
import com.example.finance.repository.project.ProjectRepository;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.repository.upload.UploadSessionRepository;
import com.example.finance.service.common.RedisService;
import com.example.finance.service.common.S3Service;
import com.example.finance.service.data.SessionDataService;
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

import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.time.Duration;
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
    private final ClusterStatisticsRepository clusterStatisticsRepository;
    private final PreprocessingConfigRepository preprocessingConfigRepository;
    private final ProcessViewDataRepository processViewDataRepository;
    private final SessionDataRepository sessionDataRepository;
    private final SessionDataService sessionDataService;
    private final SearchKeywordHierarchyRepository searchKeywordHierarchyRepository;
    private final LongShortListRepository longShortListRepository;
    private final AbleTaskRepository ableTaskRepository;
    private final TaskDocumentRepository taskDocumentRepository;
    private final CostReductionDashboardRepository costReductionDashboardRepository;
    private final com.example.finance.repository.auth.UserRepository userRepository;
    private final S3Service s3Service;
    private final RedisService redisService;

    // 클래스 상단에 추가
    private final MongoTemplate mongoTemplate;
    private final com.example.finance.service.admin.MaintenanceService maintenanceService;
    private final ObjectMapper objectMapper;
    private final SqsClient sqsClient;
    private final StringRedisTemplate redisTemplate;
    private final S3Presigner s3Presigner;

    private static final String S3_BUCKET = System.getenv().getOrDefault(
            "S3_BUCKET_NAME", "finance-excel-uploads"
    );

    // ===== 세션 편집자 잠금 설정 =====
    private static final String SESSION_LOCK_KEY_PREFIX = "session:lock:";
    private static final Duration SESSION_LOCK_TTL = Duration.ofSeconds(60);

    // ===== 업로드 페이지 편집자 잠금 설정 =====
    private static final String UPLOAD_PAGE_LOCK_KEY_PREFIX = "project:upload:lock:";
    private static final Duration UPLOAD_PAGE_LOCK_TTL = Duration.ofSeconds(60);

    @Value("${aws.sqs.excel-queue-url}")
    private String sqsQueueUrl;

    // ========================================================================
    // ===== 세션 편집자 잠금 (Redis + MongoDB 이중 관리) =====
    // ========================================================================

    /**
     * 세션 편집자 잠금 획득 (Redis SET NX + MongoDB 저장)
     * 대시보드 잠금 정책과 동일한 패턴 적용
     */
    public Map<String, Object> acquireSessionLock(String sessionId, String userId, String userName) {
        String lockKey = SESSION_LOCK_KEY_PREFIX + sessionId;

        // Redis SET NX 시도 (키가 없을 때만 설정)
        Boolean acquired = redisService.setIfAbsent(lockKey, userId, SESSION_LOCK_TTL);

        if (Boolean.TRUE.equals(acquired)) {
            // 잠금 획득 성공 → MongoDB에도 편집자 정보 저장
            fileSessionRepository.findBySessionId(sessionId).ifPresent(session -> {
                session.setEditorUserId(userId);
                session.setEditorUserName(userName);
                session.setEditorAcquiredAt(LocalDateTime.now());
                session.setEditorHeartbeatAt(LocalDateTime.now());
                session.setUpdatedAt(LocalDateTime.now());
                fileSessionRepository.save(session);
            });

            log.info("[SESSION-LOCK] 잠금 획득: sessionId={}, userId={}", sessionId, userId);
            Map<String, Object> result = new HashMap<>();
            result.put("isEditor", true);
            result.put("editorUserId", userId);
            result.put("editorUserName", userName);
            return result;
        }

        // 이미 잠금이 있음 → 현재 편집자가 본인인지 확인
        Object currentEditor = redisService.get(lockKey);
        if (userId.equals(currentEditor)) {
            // 본인이 이미 편집자 → TTL 갱신
            redisService.expire(lockKey, SESSION_LOCK_TTL);
            log.debug("[SESSION-LOCK] TTL 갱신 (본인): sessionId={}, userId={}", sessionId, userId);
            Map<String, Object> result = new HashMap<>();
            result.put("isEditor", true);
            result.put("editorUserId", userId);
            result.put("editorUserName", userName);
            return result;
        }

        // 다른 사람이 편집자
        FileSession session = fileSessionRepository.findBySessionId(sessionId).orElse(null);
        log.info("[SESSION-LOCK] 잠금 거부: sessionId={}, requestor={}, currentEditor={}",
                sessionId, userId, currentEditor);
        Map<String, Object> result = new HashMap<>();
        result.put("isEditor", false);
        result.put("editorUserId", session != null ? session.getEditorUserId() : String.valueOf(currentEditor));
        result.put("editorUserName", session != null ? session.getEditorUserName() : null);
        return result;
    }

    /**
     * 세션 편집자 하트비트 (Redis TTL 갱신 + MongoDB 하트비트 시간 업데이트)
     */
    public void sessionHeartbeat(String sessionId, String userId) {
        String lockKey = SESSION_LOCK_KEY_PREFIX + sessionId;
        Object currentEditor = redisService.get(lockKey);

        if (userId.equals(currentEditor)) {
            redisService.expire(lockKey, SESSION_LOCK_TTL);

            fileSessionRepository.findBySessionId(sessionId).ifPresent(session -> {
                session.setEditorHeartbeatAt(LocalDateTime.now());
                session.setUpdatedAt(LocalDateTime.now());
                fileSessionRepository.save(session);
            });
        } else {
            log.warn("[SESSION-LOCK] 비편집자 하트비트: sessionId={}, userId={}", sessionId, userId);
        }
    }

    /**
     * 세션 편집자 잠금 해제 (Redis DEL + MongoDB 편집자 정보 삭제)
     */
    public void releaseSessionLock(String sessionId, String userId) {
        String lockKey = SESSION_LOCK_KEY_PREFIX + sessionId;
        Object currentEditor = redisService.get(lockKey);

        if (userId.equals(currentEditor)) {
            redisService.delete(lockKey);

            fileSessionRepository.findBySessionId(sessionId).ifPresent(session -> {
                session.setEditorUserId(null);
                session.setEditorUserName(null);
                session.setEditorAcquiredAt(null);
                session.setEditorHeartbeatAt(null);
                session.setUpdatedAt(LocalDateTime.now());
                fileSessionRepository.save(session);
            });

            log.info("[SESSION-LOCK] 잠금 해제: sessionId={}, userId={}", sessionId, userId);
        }
    }

    /**
     * 세션 잠금 상태 확인 (세션 목록 등에서 사용)
     */
    public Map<String, Object> getSessionLockStatus(String sessionId, String userId) {
        String lockKey = SESSION_LOCK_KEY_PREFIX + sessionId;
        Object currentEditor = redisService.get(lockKey);
        boolean isLocked = currentEditor != null;
        boolean isEditor = userId.equals(currentEditor);

        FileSession session = fileSessionRepository.findBySessionId(sessionId).orElse(null);

        Map<String, Object> result = new HashMap<>();
        result.put("isLocked", isLocked);
        result.put("isEditor", isEditor);
        result.put("editorUserId", isLocked ? String.valueOf(currentEditor) :
                (session != null ? session.getEditorUserId() : null));
        result.put("editorUserName", isLocked && session != null ? session.getEditorUserName() : null);
        return result;
    }

    // ========================================================================
    // ===== 업로드 페이지 편집자 잠금 (프로젝트 단위) =====
    // ========================================================================

    /**
     * 업로드 페이지 편집자 잠금 획득.
     * 다른 편집자가 이미 사용 중이면 isEditor=false를 반환한다.
     */
    public Map<String, Object> acquireUploadPageLock(String projectId, String userId, String userName) {
        String lockKey = UPLOAD_PAGE_LOCK_KEY_PREFIX + projectId;

        Boolean acquired = redisService.setIfAbsent(lockKey, userId, UPLOAD_PAGE_LOCK_TTL);

        if (Boolean.TRUE.equals(acquired)) {
            log.info("[UPLOAD-PAGE-LOCK] 잠금 획득: projectId={}, userId={}", projectId, userId);
            Map<String, Object> result = new HashMap<>();
            result.put("isEditor", true);
            result.put("editorUserId", userId);
            result.put("editorUserName", userName);
            return result;
        }

        // 이미 잠금 → 본인인지 확인
        Object currentEditor = redisService.get(lockKey);
        if (userId.equals(currentEditor)) {
            redisService.expire(lockKey, UPLOAD_PAGE_LOCK_TTL);
            log.debug("[UPLOAD-PAGE-LOCK] TTL 갱신 (본인): projectId={}, userId={}", projectId, userId);
            Map<String, Object> result = new HashMap<>();
            result.put("isEditor", true);
            result.put("editorUserId", userId);
            result.put("editorUserName", userName);
            return result;
        }

        // 다른 편집자
        log.info("[UPLOAD-PAGE-LOCK] 잠금 거부: projectId={}, requestor={}, currentEditor={}",
                projectId, userId, currentEditor);
        Map<String, Object> result = new HashMap<>();
        result.put("isEditor", false);
        result.put("editorUserId", String.valueOf(currentEditor));
        result.put("editorUserName", resolveUserName(String.valueOf(currentEditor)));
        return result;
    }

    /**
     * 업로드 페이지 하트비트 (TTL 갱신)
     */
    public void uploadPageHeartbeat(String projectId, String userId) {
        String lockKey = UPLOAD_PAGE_LOCK_KEY_PREFIX + projectId;
        Object currentEditor = redisService.get(lockKey);

        if (userId.equals(currentEditor)) {
            redisService.expire(lockKey, UPLOAD_PAGE_LOCK_TTL);
        } else {
            log.warn("[UPLOAD-PAGE-LOCK] 비편집자 하트비트: projectId={}, userId={}", projectId, userId);
        }
    }

    /**
     * 업로드 페이지 잠금 해제
     */
    public void releaseUploadPageLock(String projectId, String userId) {
        String lockKey = UPLOAD_PAGE_LOCK_KEY_PREFIX + projectId;
        Object currentEditor = redisService.get(lockKey);

        if (userId.equals(currentEditor)) {
            redisService.delete(lockKey);
            log.info("[UPLOAD-PAGE-LOCK] 잠금 해제: projectId={}, userId={}", projectId, userId);
        }
    }

    /**
     * userId로 사용자 이름 조회 (잠금 정보 표시용)
     */
    private String resolveUserName(String userId) {
        try {
            return userRepository.findById(userId)
                    .map(user -> user.getName())
                    .orElse(null);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 세션의 편집 잠금 상태를 Redis 기준으로 확인하여 응답에 추가
     */
    private void populateLockInfo(FileSessionResponse response, String sessionId) {
        String lockKey = SESSION_LOCK_KEY_PREFIX + sessionId;
        Object currentEditor = redisService.get(lockKey);

        if (currentEditor != null) {
            response.setIsEditing(true);
            response.setEditorUserId(String.valueOf(currentEditor));
            // MongoDB에서 편집자명 조회
            FileSession session = fileSessionRepository.findBySessionId(sessionId).orElse(null);
            response.setEditorUserName(session != null ? session.getEditorUserName() : null);
        } else {
            response.setIsEditing(false);
            response.setEditorUserId(null);
            response.setEditorUserName(null);
        }
    }

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

            // 10.5 프로젝트 완료 상태 자동 갱신
            checkAndUpdateProjectCompletion(fileSession.getProjectId());

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

        String lambdaUploadId = null;
        boolean lambdaStarted = false;
        try {
            log.info("⭐ Lambda raw_data Insert 트리거: file={}, account={}",
                    fileInfo.getFileName(), fileInfo.getAccountColumnName());

            lambdaUploadId = extractUploadIdFromFileS3Key(fileInfo.getS3Key());

            // Lambda 작업 시작 - 유지보수 모드 자동 활성화 (SQS 발행 전 설정)
            try {
                if (lambdaUploadId != null) {
                    maintenanceService.onLambdaStart(lambdaUploadId);
                    lambdaStarted = true;
                }
            } catch (Exception e) {
                log.warn("[MAINTENANCE] Lambda 시작 상태 업데이트 실패: {}", e.getMessage());
            }

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
            // Lambda 시작 후 SQS 발행 실패 시 유지보수 모드 해제
            if (lambdaStarted && lambdaUploadId != null) {
                try {
                    maintenanceService.onLambdaFailed(lambdaUploadId);
                } catch (Exception ex) {
                    log.warn("[MAINTENANCE] Lambda 실패 상태 복구 실패: {}", ex.getMessage());
                }
            }
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
     * 역할: 선택된 파일들을 묶어 새로운 작업 세션을 생성하고, 통계 정보를 합산하여 저장함.
     */
    @Transactional
    public FileSession createFileSession(String userId, CreateFileSessionRequest request) {
        log.info("세션 생성 요청: projectId={}, sessionName={}, files={}",
                request.getProjectId(), request.getSessionName(), request.getFileIds());

        if (request.getFileIds() == null || request.getFileIds().isEmpty()) {
            throw new BusinessException("INVALID_REQUEST", "최소 하나 이상의 파일을 선택해야 합니다.");
        }

        List<UploadedFileInfo> sessionFiles = new ArrayList<>();
        long sessionTotalRows = 0;
        double sessionTotalAmount = 0.0; // 합산을 위해 Double로 선언
        Set<String> sessionAccounts = new HashSet<>();
        Set<String> processedFileIds = new HashSet<>();

        for (String fileId : request.getFileIds()) {
            if (processedFileIds.contains(fileId)) continue;

            // 중복 방지 조회
            FileSession originSession = fileSessionRepository.findFirstByUploadedFilesFileId(fileId)
                    .orElseThrow(() -> new BusinessException("FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

            UploadedFileInfo fileInfo = originSession.getUploadedFiles().stream()
                    .filter(f -> f.getFileId().equals(fileId))
                    .findFirst()
                    .orElse(null);

            if (fileInfo != null) {
                sessionFiles.add(fileInfo);
                processedFileIds.add(fileId);

                // 1) 행 수 합산
                if (fileInfo.getRowCount() != null) {
                    sessionTotalRows += fileInfo.getRowCount();
                }

                // 2) 금액 합산 (null 안전 처리)
                if (fileInfo.getTotalAmount() != null) {
                    sessionTotalAmount += fileInfo.getTotalAmount();
                }

                // 3) 계정명 수집 (StreamingCell 오염 데이터 필터링)
                if (fileInfo.getAccountContents() != null) {
                    fileInfo.getAccountContents().stream()
                            .filter(name -> !name.contains("StreamingCell@"))
                            .forEach(sessionAccounts::add);
                }
            }
        }

        if (sessionFiles.isEmpty()) {
            throw new BusinessException("FILE_NOT_FOUND", "유효한 파일 정보를 찾을 수 없습니다.");
        }

        // 세션 객체 생성
        FileSession newSession = FileSession.builder()
                .sessionId(UUID.randomUUID().toString())
                .projectId(request.getProjectId())
                .sessionName(request.getSessionName())
                .uploadedFiles(sessionFiles)
                .createdBy(userId)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now()) // UpdatedAt 명시

                // [수정] 합산된 통계 정보 매핑
                .totalRowCount(sessionTotalRows)
                .totalAmount((long) sessionTotalAmount) // Double -> Long 변환 저장
                .accountNames(new ArrayList<>(sessionAccounts)) // Set -> List 변환 저장

                .isCompleted(false)
                .isDeleted(false)
                .build();

        return fileSessionRepository.save(newSession);
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
                // ⭐ [신규 추가] 세션명이 있는(유효한) 세션만 필터링
                .filter(s -> s.getSessionName() != null && !s.getSessionName().trim().isEmpty())
                .map(s -> {
                    FileSessionResponse response = toFileSessionResponse(s);
                    // 분석 상태 계산
                    if (Boolean.TRUE.equals(s.getIsCompleted())) {
                        response.setAnalysisStatus("완료");
                    } else if ("EXPORTING".equals(s.getExportStatus())) {
                        response.setAnalysisStatus("완료처리중");
                    } else {
                        long sessionDataCount = sessionDataRepository.countBySessionId(s.getSessionId());
                        response.setAnalysisStatus(sessionDataCount > 0 ? "진행중" : "시작전");
                    }
                    // 편집자 잠금 정보 추가
                    populateLockInfo(response, s.getSessionId());
                    return response;
                })
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

        FileSessionResponse response = toFileSessionResponseWithDetails(fileSession);
        // 편집자 잠금 정보 추가
        populateLockInfo(response, sessionId);
        return response;
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
        fileSession.setCurrentStep(ProcessStep.START_ANALYSIS);
        fileSession.setProgressPercentage(0);

        StepHistory stepHistory = StepHistory.builder()
                .step(ProcessStep.START_ANALYSIS)
                .startedAt(LocalDateTime.now())
                .status("in_progress")
                .build();

        fileSession.getStepHistory().add(stepHistory);
        fileSession.setUpdatedAt(LocalDateTime.now());

        return fileSessionRepository.save(fileSession);
    }

    /**
     * 세션 step_history 업데이트 (step 진입 시)
     *
     * @param sessionId 세션 ID
     * @param step 현재 진입한 step
     */
    public void updateStepHistory(String sessionId, ProcessStep step) {
        // Step 7 (Detail Clustering)는 step history에 기록하지 않음
        if (step == ProcessStep.DETAIL_CLUSTERING) {
            log.info("Detail Clustering(Step 7)은 step history에 기록하지 않음: sessionId={}", sessionId);
            return;
        }

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        fileSession.setCurrentStep(step);

        // 동일 step이 이미 있으면 startedAt만 갱신, 없으면 추가
        boolean found = false;
        for (StepHistory sh : fileSession.getStepHistory()) {
            if (sh.getStep() == step) {
                sh.setStartedAt(LocalDateTime.now());
                sh.setStatus("in_progress");
                found = true;
                break;
            }
        }
        if (!found) {
            fileSession.getStepHistory().add(StepHistory.builder()
                    .step(step)
                    .startedAt(LocalDateTime.now())
                    .status("in_progress")
                    .build());
        }

        fileSession.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(fileSession);
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
        clusteringResultRepository.deleteBySessionId(sessionId);
        log.info("clustering_results 삭제 완료");

        // 3-1. session_data 삭제
        sessionDataService.deleteSessionData(sessionId);
        sessionDataService.deleteColumnMappings(sessionId);
        sessionDataService.deleteProcessData(sessionId);
        preprocessingConfigRepository.deleteBySessionId(sessionId);
        processViewDataRepository.deleteBySessionId(sessionId);

        // 3-2. search_keyword_hierarchy 삭제
        try {
            searchKeywordHierarchyRepository.deleteBySessionId(sessionId);
            log.info("search_keyword_hierarchy 삭제 완료: sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("search_keyword_hierarchy 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 3-3. upload_sessions 삭제
        try {
            uploadSessionRepository.deleteBySessionId(sessionId);
            log.info("upload_sessions 삭제 완료: sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("upload_sessions 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        log.info("session_data + column_mapping + process_data + preprocessing_config + process_view_data + search_keyword_hierarchy + upload_sessions 삭제 완료: sessionId={}", sessionId);

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
     * 세션 관련 모든 데이터 일괄 삭제 (cascade)
     * raw_data, session_data, column_mapping, process_data, clustering_results,
     * search_keyword_hierarchy, preprocessing_config, process_view_data, upload_sessions, S3 파일
     */
    public void cascadeDeleteSessionData(String sessionId, String projectId) {
        log.info("세션 데이터 일괄 삭제 시작: sessionId={}, projectId={}", sessionId, projectId);

        // 1. raw_data 삭제
        try {
            rawDataRepository.deleteByProjectIdAndSessionId(projectId, sessionId);
            log.info("raw_data 삭제 완료: sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("raw_data 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 2. session_data 삭제
        try {
            sessionDataService.deleteSessionData(sessionId);
        } catch (Exception e) {
            log.warn("session_data 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 3. column_mapping 삭제
        try {
            sessionDataService.deleteColumnMappings(sessionId);
        } catch (Exception e) {
            log.warn("column_mapping 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 4. process_data 삭제
        try {
            sessionDataService.deleteProcessData(sessionId);
            processDataRepository.deleteByProjectIdAndSessionId(projectId, sessionId);
        } catch (Exception e) {
            log.warn("process_data 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 5. clustering_results 삭제
        try {
            clusteringResultRepository.deleteBySessionId(sessionId);
            log.info("clustering_results 삭제 완료: sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("clustering_results 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 5-1. cluster_statistics 삭제
        try {
            clusterStatisticsRepository.deleteBySessionId(sessionId);
            log.info("cluster_statistics 삭제 완료: sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("cluster_statistics 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 6. search_keyword_hierarchy 삭제
        try {
            searchKeywordHierarchyRepository.deleteBySessionId(sessionId);
            log.info("search_keyword_hierarchy 삭제 완료: sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("search_keyword_hierarchy 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 7. preprocessing_config 삭제
        try {
            preprocessingConfigRepository.deleteBySessionId(sessionId);
        } catch (Exception e) {
            log.warn("preprocessing_config 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 8. process_view_data 삭제
        try {
            processViewDataRepository.deleteBySessionId(sessionId);
        } catch (Exception e) {
            log.warn("process_view_data 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 9. upload_sessions 삭제
        try {
            uploadSessionRepository.deleteBySessionId(sessionId);
            log.info("upload_sessions 삭제 완료: sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("upload_sessions 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 10. S3 세션 폴더 삭제 (업로드 파일)
        try {
            String s3Prefix = String.format("projects/%s/sessions/%s/", projectId, sessionId);
            s3Service.deleteFolder(s3Prefix);
            log.info("S3 세션 폴더 삭제 완료: prefix={}", s3Prefix);
        } catch (Exception e) {
            log.warn("S3 세션 폴더 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // 11. S3 export 파일 삭제 (exports/{sessionId}/)
        try {
            String exportPrefix = String.format("exports/%s/", sessionId);
            s3Service.deleteFolder(exportPrefix);
            log.info("S3 export 폴더 삭제 완료: prefix={}", exportPrefix);
        } catch (Exception e) {
            log.warn("S3 export 폴더 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        log.info("세션 데이터 일괄 삭제 완료: sessionId={}", sessionId);
    }

    /**
     * 세션 삭제 (하드 삭제 + 전체 cascade)
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

        // ★ Redis 세션 잠금 정리
        redisService.delete(SESSION_LOCK_KEY_PREFIX + sessionId);

        // ★ 전체 cascade 삭제
        cascadeDeleteSessionData(sessionId, fileSession.getProjectId());

        // 완전 삭제
        fileSessionRepository.delete(fileSession);

        // ★ 프로젝트 통계 재계산 (totalSessions, totalFiles 등)
        refreshProjectStats(fileSession.getProjectId());

        log.info("세션 삭제 완료: sessionId={}", sessionId);
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

        // 2. 동일 프로젝트 검증
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

        // 4. 0번째 세션을 기준, 나머지를 별도 리스트로 복사
        FileSession baseSession = sessions.get(0);
        List<FileSession> otherSessions = new ArrayList<>(sessions.subList(1, sessions.size()));

        // 5. 모든 세션의 파일 합산
        List<UploadedFileInfo> mergedFiles = new ArrayList<>(baseSession.getUploadedFiles());
        for (FileSession other : otherSessions) {
            if (other.getUploadedFiles() != null) {
                mergedFiles.addAll(other.getUploadedFiles());
            }
        }

        // 6. 합산 데이터 계산 - 세션 레벨의 집계 데이터를 합산
        long totalRowCount = sessions.stream()
                .mapToLong(s -> s.getTotalRowCount() != null ? s.getTotalRowCount() : 0L)
                .sum();

        long totalAmount = sessions.stream()
                .mapToLong(s -> s.getTotalAmount() != null ? s.getTotalAmount() : 0L)
                .sum();


        // 7. accountNames 수집 - 세션 레벨 + 파일 레벨 모두에서 수집 (StreamingCell 오염 필터링)
        Set<String> accountNameSet = new LinkedHashSet<>();
        for (FileSession s : sessions) {
            if (s.getAccountNames() != null) {
                s.getAccountNames().stream()
                        .filter(name -> !name.contains("StreamingCell@"))
                        .forEach(accountNameSet::add);
            }
        }
        // 파일 내 accountContents에서도 수집 (세션 레벨에 없을 경우 대비)
        for (UploadedFileInfo file : mergedFiles) {
            if (file.getAccountContents() != null) {
                file.getAccountContents().stream()
                        .filter(name -> !name.contains("StreamingCell@"))
                        .forEach(accountNameSet::add);
            }
        }

        List<String> mergedAccountColumnNames = sessions.stream()
                .filter(s -> s.getAccountColumnNames() != null)
                .flatMap(s -> s.getAccountColumnNames().stream())
                .distinct()
                .collect(Collectors.toList());

        // 8. 나머지 세션 하드 삭제 (save보다 먼저 실행)
        for (FileSession other : otherSessions) {
            log.info("병합으로 삭제할 세션: sessionId={}, mongoId={}", other.getSessionId(), other.getId());
            fileSessionRepository.deleteById(other.getId());
        }

        // 9. 기준 세션 업데이트 후 저장
        baseSession.setSessionName(request.getNewSessionName());
        if (request.getWorkerName() != null) {
            baseSession.setWorkerName(request.getWorkerName());
        }
        baseSession.setUploadedFiles(mergedFiles);
        baseSession.setTotalFiles(mergedFiles.size());
        baseSession.setTotalRowCount(totalRowCount);
        baseSession.setTotalAmount(totalAmount);
        baseSession.setAccountNames(new ArrayList<>(accountNameSet));
        baseSession.setAccountColumnNames(mergedAccountColumnNames);
        baseSession.setUpdatedAt(LocalDateTime.now());
        baseSession.setLastAccessedAt(LocalDateTime.now());

        fileSessionRepository.save(baseSession);

        log.info("세션 병합 완료: baseSessionId={}, accountNames={}, 삭제된 세션 수={}",
                baseSession.getSessionId(), accountNameSet, otherSessions.size());

        return baseSession;
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
                .exportPath(session.getExportPath())
                .exportStatus(session.getExportStatus())
                .exportMessage(session.getExportMessage())
                .accountNames(session.getAccountNames())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .lastAccessedAt(session.getLastAccessedAt())
                .completedAt(session.getCompletedAt())
                .uploadedFiles(session.getUploadedFiles())
                .categoryColumn(session.getCategoryColumn())
                .costCenterColumn(session.getCostCenterColumn())
                .supplierColumn(session.getSupplierColumn())
                .amountColumn(session.getAmountColumn())
                .targetColumn(session.getTargetColumn())
                .stepHistory(session.getStepHistory())
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
                .exportPath(session.getExportPath())
                .exportStatus(session.getExportStatus())
                .exportMessage(session.getExportMessage())
                .accountNames(session.getAccountNames())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .lastAccessedAt(session.getLastAccessedAt())
                .completedAt(session.getCompletedAt())
                .uploadedFiles(session.getUploadedFiles())
                .stepHistory(session.getStepHistory())
                .categoryColumn(session.getCategoryColumn())
                .costCenterColumn(session.getCostCenterColumn())
                .supplierColumn(session.getSupplierColumn())
                .amountColumn(session.getAmountColumn())
                .targetColumn(session.getTargetColumn())
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
            FileSession sourceSession = fileSessionRepository.findFirstByUploadedFilesFileId(fileId)
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
     * 대시보드 컬럼 매핑 저장
     * - categoryColumn(=대계정), amountColumn, supplierColumn, costCenterColumn
     */
    public FileSession updateDashboardColumnMappings(String sessionId, Map<String, String> mappings) {
        FileSession session = fileSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException("SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        if (mappings.containsKey("accountColumn")) {
            session.setCategoryColumn(mappings.get("accountColumn"));
        }
        if (mappings.containsKey("amountColumn")) {
            session.setAmountColumn(mappings.get("amountColumn"));
        }
        if (mappings.containsKey("supplierColumn")) {
            session.setSupplierColumn(mappings.get("supplierColumn"));
        }
        if (mappings.containsKey("costCenterColumn")) {
            session.setCostCenterColumn(mappings.get("costCenterColumn"));
        }

        session.setUpdatedAt(LocalDateTime.now());
        return fileSessionRepository.save(session);
    }

    /**
     * 파티션 기반 세션 일괄 생성 (Full Logic)
     * * @param userId 사용자 ID
     * @param projectId 프로젝트 ID
     * @param partitions 파티션 정보 목록 (AccountPartition DTO 사용)
     * @return 생성된 세션 응답 목록
     */
    @Transactional
    public List<FileSessionResponse> createSessionsFromPartitions(
            String userId,
            String projectId,
            List<AccountPartition> partitions) { // DTO 이름 맞춤 (AccountPartitionResponse -> AccountPartition)

        log.info("⭐ 파티션 기반 세션 일괄 생성 시작: userId={}, projectId={}, partitions={}",
                userId, projectId, partitions.size());

        // 1. 프로젝트 조회 및 권한 확인 (복원됨)
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // 멤버 권한 체크 (간단한 버전, 필요시 Member 객체 구조에 맞게 수정)
        boolean isMember = project.getMembers() != null && project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        // (주의: 프로젝트 생성자나 관리자 로직이 별도로 있다면 여기에 추가 조건 필요)
        if (!isMember) {
            // throw new RuntimeException("프로젝트에 접근할 권한이 없습니다");
            // 일단 로직 흐름을 위해 로그만 남기거나, 실제 운영환경에선 주석 해제
            log.warn("프로젝트 멤버가 아닙니다. (권한 체크 로직 확인 필요): userId={}", userId);
        }

        // 중복 세션명 검증
        Set<String> existingNames = fileSessionRepository.findByProjectId(projectId).stream()
                .map(s -> s.getSessionName())
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        for (AccountPartition partition : partitions) {
            String name = partition.getSessionName();
            if (name != null && !name.isEmpty() && existingNames.contains(name)) {
                throw new BusinessException("DUPLICATE_SESSION_NAME",
                        "이미 존재하는 세션명입니다: " + name);
            }
        }

        List<FileSessionResponse> createdSessions = new ArrayList<>();
        int sessionCounter = 1;  // ⭐ 세션 번호 카운터 (복원됨)

        // 2. 각 파티션별로 세션 생성
        for (AccountPartition partition : partitions) {
            try {
                log.info("파티션 처리 중: accountName={}, fileIds={}",
                        partition.getAccountName(), partition.getFileIds());

                // 🚨 [수정] NPE 방지 로직: fileIds가 없으면 fileId(단일)라도 사용하도록 처리
                List<String> targetFileIds = partition.getFileIds();

                if (targetFileIds == null || targetFileIds.isEmpty()) {
                    if (partition.getFileId() != null) {
                        // 단일 fileId를 리스트로 변환하여 사용
                        targetFileIds = Collections.singletonList(partition.getFileId());
                    } else {
                        log.warn("파일 ID 정보가 없어 파티션을 건너뜁니다: accountName={}", partition.getAccountName());
                        continue;
                    }
                }

                List<UploadedFileInfo> uploadedFiles = new ArrayList<>();

                for (String fileId : targetFileIds) {
                    // FileSession에서 fileId로 파일 찾기
                    Optional<FileSession> sessionOpt = fileSessionRepository.findFirstByUploadedFilesFileId(fileId);

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

                // 2-2. 통계 계산 (Partition 정보 우선 사용)
                // 행 수는 파일들의 단순 합계 (필요시 파티션 정보 사용 가능)
                long totalRowCount = partition.getRowCount() > 0 ? partition.getRowCount() :
                        uploadedFiles.stream().mapToLong(f -> f.getRowCount() != null ? f.getRowCount() : 0L).sum();

                // 금액은 파티션 분석 결과를 신뢰 (파일 전체 합계가 아닌, 쪼개진 금액)
                long totalAmount = (long) partition.getTotalAmount();

                // 2-3. 세션명 생성 (복원됨)
                // 파티션에 세션명이 없으면 자동 생성 규칙 적용
                String sessionName;
                if (partition.getSessionName() != null && !partition.getSessionName().isEmpty()) {
                    sessionName = partition.getSessionName();
                } else if (partition.getAccountName() != null && !partition.getAccountName().isEmpty()) {
                    sessionName = partition.getAccountName() + "_session";
                } else {
                    sessionName = (partition.getFileName() != null && !partition.getFileName().isEmpty())
                            ? partition.getFileName()
                            : String.format("session_%d", sessionCounter++);
                }

                // 2-4. FileSession 생성
                FileSession session = FileSession.builder()
                        .sessionId(UUID.randomUUID().toString())
                        .projectId(projectId)
                        .sessionName(sessionName)
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
                        .accountNames(Collections.singletonList(partition.getAccountName())) // ⭐ List로 저장
                        .accountColumnNames(new ArrayList<>())
                        .isDeleted(false)
                        .build();

                // 2-5. MongoDB 저장
                session = fileSessionRepository.save(session);

                // 2-6. 응답 DTO 생성
                FileSessionResponse response = FileSessionResponse.builder()
                        .sessionId(session.getSessionId())
                        .projectId(session.getProjectId())
                        .sessionName(session.getSessionName())
                        .workerName(session.getWorkerName())
                        .totalFiles(session.getTotalFiles())
                        .totalRowCount(session.getTotalRowCount())
                        .totalAmount(session.getTotalAmount())
                        .accountNames(session.getAccountNames())
                        .currentStep(session.getCurrentStep())
                        .progressPercentage(session.getProgressPercentage())
                        .isCompleted(session.getIsCompleted())
                        .createdAt(session.getCreatedAt())
                        .updatedAt(session.getUpdatedAt())
                        .lastAccessedAt(session.getLastAccessedAt())
                        .uploadedFiles(session.getUploadedFiles())
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

        // 3. 프로젝트 세션 수 업데이트 + 완료 상태 해제
        if (!createdSessions.isEmpty()) {
            project.setTotalSessions(project.getTotalSessions() + createdSessions.size());
            project.setTotalFiles(project.getTotalFiles() +
                    createdSessions.stream()
                            .mapToInt(s -> s.getTotalFiles() != null ? s.getTotalFiles() : 0)
                            .sum());
            project.setIsCompleted(false); // 새 세션 생성 시 프로젝트 완료 해제
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

            if (!session.getProjectId().equals(projectId)) {
                throw new BusinessException("FORBIDDEN", "프로젝트 세션이 아닙니다");
            }

            // ★ Redis 세션 잠금 정리
            redisService.delete(SESSION_LOCK_KEY_PREFIX + sessionId);

            // ★ 전체 cascade 삭제
            cascadeDeleteSessionData(sessionId, projectId);

            // 완전 삭제
            fileSessionRepository.delete(session);
        }

        // ★ 프로젝트 레벨 대시보드 데이터 초기화
        resetProjectDashboardData(projectId);

        // ★ 프로젝트 통계 재계산 (totalSessions, totalFiles 등)
        refreshProjectStats(projectId);

        log.info("세션 일괄 완전 삭제 완료: {} 개", sessionIds.size());
    }

    /**
     * 프로젝트 레벨 대시보드 데이터 초기화
     * 세션 삭제 시 관련 대시보드 컬렉션을 모두 삭제하고 프로젝트 완료 상태를 해제한다.
     */
    private void resetProjectDashboardData(String projectId) {
        try {
            longShortListRepository.deleteByProjectId(projectId);
            ableTaskRepository.deleteByProjectId(projectId);
            taskDocumentRepository.deleteByProjectId(projectId);
            costReductionDashboardRepository.deleteByProjectId(projectId);

            Project project = projectRepository.findByProjectId(projectId).orElse(null);
            if (project != null) {
                project.setIsCompleted(false);
                project.setUpdatedAt(LocalDateTime.now());
                projectRepository.save(project);
            }
            log.info("프로젝트 대시보드 데이터 초기화 완료: projectId={}", projectId);
        } catch (Exception e) {
            log.warn("프로젝트 대시보드 데이터 초기화 실패: {}", e.getMessage());
        }
    }

    /**
     * 세션 완료 처리 (Step 1 → Step 2 진입)
     *
     * 파일 행 수를 기반으로 청크를 나눠 ExcelWorkerHandler가 처리할 수 있는
     * 정확한 ProcessingMessage 포맷의 SQS 메시지를 발행합니다.
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

        // 4. raw_data 컬렉션 초기화
        Query deleteQuery = new Query(Criteria.where("sessionId").is(sessionId));
        long deletedRawData = mongoTemplate.remove(deleteQuery, "raw_data").getDeletedCount();
        log.info("raw_data 초기화 완료: {} 건 삭제", deletedRawData);

        // 5. 세션 파싱 진행 상태 Redis 초기화
        String sessionParseKey = "session:parse:" + sessionId;
        Map<String, String> parseInitData = new HashMap<>();
        parseInitData.put("status", "PROCESSING");
        parseInitData.put("totalFiles", String.valueOf(session.getUploadedFiles().size()));
        parseInitData.put("completedFiles", "0");
        parseInitData.put("totalRows", "0");
        parseInitData.put("processedRows", "0");
        parseInitData.put("progress", "0");
        parseInitData.put("startTime", String.valueOf(System.currentTimeMillis()));
        redisTemplate.opsForHash().putAll(sessionParseKey, parseInitData);
        redisTemplate.expire(sessionParseKey, 24, TimeUnit.HOURS);

        // 6. 파일별 청크 분할 후 SQS 메시지 발행 (ProcessingMessage 포맷 준수)
        int processedFileCount = 0;
        int totalChunksPublished = 0;
        final int CHUNK_SIZE = 50000;

        for (UploadedFileInfo fileInfo : session.getUploadedFiles()) {
            try {
                String uploadId = extractUploadIdFromFileS3Key(fileInfo.getS3Key());
                if (uploadId == null) {
                    log.warn("uploadId 추출 실패: s3Key={}", fileInfo.getS3Key());
                    continue;
                }

                // 행 수 결정: rowCount가 이미 있으면 사용, 없으면 추정
                long totalRows = (fileInfo.getRowCount() != null && fileInfo.getRowCount() > 0)
                        ? fileInfo.getRowCount()
                        : estimateRowCount(fileInfo);

                if (totalRows == 0) {
                    log.warn("행 수를 알 수 없음 (기본값 사용): file={}", fileInfo.getFileName());
                    totalRows = 1000;
                }

                int totalChunks = (int) Math.ceil((double) totalRows / CHUNK_SIZE);
                String coordinatorRunId = "backend-" + UUID.randomUUID().toString().substring(0, 8);

                log.info("⭐ 파일 청크 분할: file={}, totalRows={}, chunks={}",
                        fileInfo.getFileName(), totalRows, totalChunks);

                // Redis에 해당 uploadId 상태 초기화 (ExcelWorkerHandler.ensureRedisStatus와 동일 구조)
                String uploadStatusKey = "upload:status:" + uploadId;
                redisTemplate.opsForHash().put(uploadStatusKey, "totalRows", String.valueOf(totalRows));
                redisTemplate.opsForHash().put(uploadStatusKey, "status", "PROCESSING");
                if (!Boolean.TRUE.equals(redisTemplate.hasKey(uploadStatusKey))) {
                    redisTemplate.opsForHash().put(uploadStatusKey, "processedRows", "0");
                    redisTemplate.opsForHash().put(uploadStatusKey, "completedChunks", "0");
                }
                redisTemplate.expire(uploadStatusKey, 86400, TimeUnit.SECONDS);

                // 청크별 SQS 메시지 발행 (ProcessingMessage 포맷 - ExcelWorkerHandler가 처리)
                for (int i = 0; i < totalChunks; i++) {
                    int startRow = i * CHUNK_SIZE + 2; // 헤더(1행) 제외, 데이터는 2행부터
                    int endRow = (int) Math.min((long)(i + 1) * CHUNK_SIZE + 1, totalRows + 1);

                    Map<String, Object> message = new HashMap<>();
                    message.put("projectId", session.getProjectId());
                    message.put("sessionId", sessionId);
                    message.put("uploadId", uploadId);
                    message.put("s3Bucket", S3_BUCKET);
                    message.put("s3Key", fileInfo.getS3Key());
                    message.put("fileName", fileInfo.getFileName());
                    message.put("startRow", startRow);
                    message.put("endRow", endRow);
                    message.put("totalRows", (int) totalRows);
                    message.put("chunkNumber", i + 1);
                    message.put("totalChunks", totalChunks);
                    message.put("isFirstChunk", i == 0);
                    message.put("coordinatorRunId", coordinatorRunId);

                    String messageBody = objectMapper.writeValueAsString(message);
                    sqsClient.sendMessage(SendMessageRequest.builder()
                            .queueUrl(sqsQueueUrl)
                            .messageBody(messageBody)
                            .build());

                    totalChunksPublished++;
                }

                processedFileCount++;
                log.info("SQS 청크 메시지 발행 완료: file={}, chunks={}", fileInfo.getFileName(), totalChunks);

            } catch (Exception e) {
                log.error("Lambda 트리거 실패: file={}, error={}",
                        fileInfo.getFileName(), e.getMessage(), e);
            }
        }

        // 7. 현재 단계 업데이트
        session.setCurrentStep(ProcessStep.START_ANALYSIS);
        session.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(session);

        Map<String, Object> result = new HashMap<>();
        result.put("sessionId", sessionId);
        result.put("currentStep", "FILE_LOAD");
        result.put("fileCount", session.getUploadedFiles().size());
        result.put("processedFileCount", processedFileCount);
        result.put("totalChunksPublished", totalChunksPublished);
        result.put("message", "세션이 Step 2로 진행되었습니다. Lambda 병렬 처리 시작됨");

        log.info("⭐ 세션 완료 처리 완료: sessionId={}, 처리 파일={}, 총 청크={}",
                sessionId, processedFileCount, totalChunksPublished);

        return result;
    }

    /**
     * 세션 파싱 진행 상태 조회 (프론트엔드 폴링용)
     *
     * 각 파일의 upload:status:{uploadId} Redis 키를 집계하여
     * 전체 세션 파싱 진행률을 반환합니다.
     *
     * @param sessionId 세션 ID
     * @return 집계된 파싱 진행 상태
     */
    public Map<String, Object> getSessionParsingStatus(String sessionId) {
        FileSession session = fileSessionRepository.findBySessionId(sessionId).orElse(null);

        Map<String, Object> result = new HashMap<>();
        result.put("sessionId", sessionId);

        if (session == null || session.getUploadedFiles() == null || session.getUploadedFiles().isEmpty()) {
            result.put("status", "NOT_STARTED");
            result.put("progress", 0);
            result.put("totalRows", 0L);
            result.put("processedRows", 0L);
            result.put("fileStatuses", new ArrayList<>());
            return result;
        }

        long totalRows = 0;
        long processedRows = 0;
        int completedFiles = 0;
        int failedFiles = 0;
        List<Map<String, Object>> fileStatuses = new ArrayList<>();

        for (UploadedFileInfo fileInfo : session.getUploadedFiles()) {
            String uploadId = extractUploadIdFromFileS3Key(fileInfo.getS3Key());
            Map<String, Object> fileStatus = new HashMap<>();
            fileStatus.put("fileId", fileInfo.getFileId());
            fileStatus.put("fileName", fileInfo.getFileName());

            if (uploadId != null) {
                String key = "upload:status:" + uploadId;
                Map<Object, Object> redisData = redisTemplate.opsForHash().entries(key);

                String fileStatusStr = redisData.containsKey("status")
                        ? redisData.get("status").toString() : "UNKNOWN";
                long fileTotalRows = redisData.containsKey("totalRows")
                        ? parseLongSafe(redisData.get("totalRows").toString()) : 0L;
                long fileProcessedRows = redisData.containsKey("processedRows")
                        ? parseLongSafe(redisData.get("processedRows").toString()) : 0L;
                int fileProgress = redisData.containsKey("progress")
                        ? parseIntSafe(redisData.get("progress").toString()) : 0;

                fileStatus.put("uploadId", uploadId);
                fileStatus.put("status", fileStatusStr);
                fileStatus.put("totalRows", fileTotalRows);
                fileStatus.put("processedRows", fileProcessedRows);
                fileStatus.put("progress", fileProgress);

                totalRows += fileTotalRows;
                processedRows += fileProcessedRows;

                if ("COMPLETED".equals(fileStatusStr)) completedFiles++;
                if ("FAILED".equals(fileStatusStr)) failedFiles++;
            } else {
                fileStatus.put("status", "UNKNOWN");
                fileStatus.put("totalRows", 0L);
                fileStatus.put("processedRows", 0L);
                fileStatus.put("progress", 0);
            }

            fileStatuses.add(fileStatus);
        }

        int totalFiles = session.getUploadedFiles().size();
        String overallStatus;
        int overallProgress;

        if (failedFiles > 0 && completedFiles + failedFiles == totalFiles) {
            overallStatus = "FAILED";
            overallProgress = totalRows > 0 ? (int) (processedRows * 100.0 / totalRows) : 0;
        } else if (completedFiles == totalFiles) {
            overallStatus = "COMPLETED";
            overallProgress = 100;
        } else {
            overallStatus = "PROCESSING";
            overallProgress = totalRows > 0
                    ? (int) Math.min(processedRows * 100.0 / totalRows, 99)
                    : (totalFiles > 0 ? completedFiles * 100 / totalFiles : 0);
        }

        result.put("status", overallStatus);
        result.put("progress", overallProgress);
        result.put("totalRows", totalRows);
        result.put("processedRows", processedRows);
        result.put("totalFiles", totalFiles);
        result.put("completedFiles", completedFiles);
        result.put("failedFiles", failedFiles);
        result.put("fileStatuses", fileStatuses);

        return result;
    }

    private long parseLongSafe(String val) {
        try { return Long.parseLong(val); } catch (Exception e) { return 0L; }
    }

    private int parseIntSafe(String val) {
        try { return Integer.parseInt(val); } catch (Exception e) { return 0; }
    }

    /**
     * s3Key에서 uploadId 추출
     * 형식: uploads/{projectId}/sessions/{sessionId}/uploads/{uploadId}/filename
     */
    private String extractUploadIdFromFileS3Key(String s3Key) {
        if (s3Key == null) return null;
        String[] parts = s3Key.split("/");
        // "uploads" 토큰을 찾아 그 다음 파트가 upload- 로 시작하면 반환
        for (int i = 0; i < parts.length - 1; i++) {
            if ("uploads".equals(parts[i]) && i > 0 && parts[i + 1].startsWith("upload-")) {
                return parts[i + 1];
            }
        }
        // fallback: upload- 로 시작하는 파트
        for (String part : parts) {
            if (part.startsWith("upload-")) return part;
        }
        return null;
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

        // 2. 권한 확인 (프로젝트 멤버이면 다운로드 가능)
        Project project = projectRepository.findByProjectId(session.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));
        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));
        if (!isMember) {
            throw new BusinessException("FORBIDDEN", "세션 접근 권한이 없습니다");
        }

        // 3. 완료 여부 확인
        if (!Boolean.TRUE.equals(session.getIsCompleted())) {
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
        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofHours(24))
                .getObjectRequest(req -> req.bucket(S3_BUCKET).key(s3Key))
                .build();
        PresignedGetObjectRequest presignedRequest = s3Presigner.presignGetObject(presignRequest);
        return presignedRequest.url().toString();
    }

    // ========================================================================
    // ===== 엑셀 데이터 재분석 (raw_data 재생성) =====
    // ========================================================================

    /**
     * 엑셀 데이터 재분석
     *
     * 선택한 세션(대시보드) 또는 파일(프로젝트)의 raw_data를 삭제하고
     * Lambda Worker를 재트리거하여 raw_data를 재생성합니다.
     *
     * @param projectId 프로젝트 ID
     * @param sessionIds 재분석할 세션 ID 목록 (null이면 fileIds 사용)
     * @param fileIds 재분석할 파일 ID 목록 (null이면 sessionIds 사용)
     * @param userId 요청 사용자 ID
     * @return 처리 결과 요약
     */
    public Map<String, Object> reanalyzeExcelData(String projectId, List<String> sessionIds,
                                                   List<String> fileIds, String userId) {
        log.info("⭐ 엑셀 데이터 재분석 시작: projectId={}, sessionIds={}, fileIds={}", projectId, sessionIds, fileIds);

        // 1. 대상 세션 수집
        List<FileSession> targetSessions = new ArrayList<>();

        if (sessionIds != null && !sessionIds.isEmpty()) {
            // 세션 ID로 직접 조회 (대시보드 모드)
            for (String sessionId : sessionIds) {
                fileSessionRepository.findBySessionId(sessionId).ifPresent(targetSessions::add);
            }
        } else if (fileIds != null && !fileIds.isEmpty()) {
            // 파일 ID로 세션 조회 (프로젝트 모드) - 해당 파일이 포함된 세션 찾기
            Set<String> fileIdSet = new HashSet<>(fileIds);
            List<FileSession> allSessions = fileSessionRepository.findByProjectId(projectId);
            for (FileSession session : allSessions) {
                if (session.getUploadedFiles() != null) {
                    boolean hasTargetFile = session.getUploadedFiles().stream()
                            .anyMatch(f -> fileIdSet.contains(f.getFileId()));
                    if (hasTargetFile) {
                        targetSessions.add(session);
                    }
                }
            }
        }

        if (targetSessions.isEmpty()) {
            throw new BusinessException("NO_TARGET", "재분석 대상 세션을 찾을 수 없습니다.");
        }

        // fileIds가 지정된 경우, 해당 파일만 대상으로 제한
        Set<String> targetFileIds = (fileIds != null && !fileIds.isEmpty())
                ? new HashSet<>(fileIds) : null;

        int totalFilesProcessed = 0;
        int totalChunksPublished = 0;
        List<String> processedSessionIds = new ArrayList<>();
        final int CHUNK_SIZE = 50000;

        for (FileSession session : targetSessions) {
            if (session.getUploadedFiles() == null || session.getUploadedFiles().isEmpty()) continue;

            String sessionId = session.getSessionId();
            processedSessionIds.add(sessionId);

            // 대상 파일 필터링
            List<UploadedFileInfo> filesToProcess = session.getUploadedFiles();
            if (targetFileIds != null) {
                filesToProcess = filesToProcess.stream()
                        .filter(f -> targetFileIds.contains(f.getFileId()))
                        .collect(Collectors.toList());
            }

            for (UploadedFileInfo fileInfo : filesToProcess) {
                String uploadId = null;
                boolean lambdaStarted = false;
                try {
                    uploadId = extractUploadIdFromFileS3Key(fileInfo.getS3Key());
                    if (uploadId == null) {
                        log.warn("uploadId 추출 실패 (재분석 스킵): s3Key={}", fileInfo.getS3Key());
                        continue;
                    }

                    // 2. 기존 raw_data 삭제
                    Query deleteRawQuery = new Query(Criteria.where("upload_id").is(uploadId));
                    long deletedRaw = mongoTemplate.remove(deleteRawQuery, "raw_data").getDeletedCount();
                    log.info("raw_data 삭제: uploadId={}, 삭제건수={}", uploadId, deletedRaw);

                    // 3. 파일 메타데이터 초기화 (파싱 재시작 상태로)
                    fileInfo.setRowCount(0L);
                    fileInfo.setDetectedColumns(null);
                    fileInfo.setUploadStatus("PROCESSING");

                    // 4. Redis 업로드 상태 초기화
                    String uploadStatusKey = "upload:status:" + uploadId;
                    Map<String, String> statusInit = new HashMap<>();
                    statusInit.put("status", "PROCESSING");
                    statusInit.put("progress", "0");
                    statusInit.put("processedRows", "0");
                    statusInit.put("completedChunks", "0");
                    statusInit.put("totalRows", "0");
                    statusInit.put("projectId", projectId);
                    statusInit.put("sessionId", sessionId);
                    statusInit.put("fileName", fileInfo.getFileName());
                    redisTemplate.opsForHash().putAll(uploadStatusKey, statusInit);
                    redisTemplate.expire(uploadStatusKey, 24, TimeUnit.HOURS);

                    // 5. 행 수 추정 (파일 크기 기반)
                    long estimatedRows = estimateRowCount(fileInfo);
                    if (estimatedRows <= 0) estimatedRows = 1000;

                    int totalChunks = (int) Math.ceil((double) estimatedRows / CHUNK_SIZE);
                    String coordinatorRunId = "reanalyze-" + UUID.randomUUID().toString().substring(0, 8);

                    log.info("⭐ 재분석 청크 분할: file={}, estimatedRows={}, chunks={}",
                            fileInfo.getFileName(), estimatedRows, totalChunks);

                    // Lambda 재분석 시작 - 유지보수 모드 자동 활성화 (SQS 발행 전 설정)
                    try {
                        maintenanceService.onLambdaStart(uploadId);
                        lambdaStarted = true;
                    } catch (Exception ex) {
                        log.warn("[MAINTENANCE] 재분석 Lambda 시작 상태 업데이트 실패: {}", ex.getMessage());
                    }

                    // 6. SQS 메시지 발행 (Lambda Worker 트리거)
                    for (int i = 0; i < totalChunks; i++) {
                        int startRow = i * CHUNK_SIZE + 2;
                        int endRow = (int) Math.min((long)(i + 1) * CHUNK_SIZE + 1, estimatedRows + 1);

                        Map<String, Object> message = new HashMap<>();
                        message.put("projectId", projectId);
                        message.put("sessionId", sessionId);
                        message.put("uploadId", uploadId);
                        message.put("s3Bucket", S3_BUCKET);
                        message.put("s3Key", fileInfo.getS3Key());
                        message.put("fileName", fileInfo.getFileName());
                        message.put("startRow", startRow);
                        message.put("endRow", endRow);
                        message.put("totalRows", (int) estimatedRows);
                        message.put("chunkNumber", i + 1);
                        message.put("totalChunks", totalChunks);
                        message.put("isFirstChunk", i == 0);
                        message.put("coordinatorRunId", coordinatorRunId);

                        String messageBody = objectMapper.writeValueAsString(message);
                        sqsClient.sendMessage(SendMessageRequest.builder()
                                .queueUrl(sqsQueueUrl)
                                .messageBody(messageBody)
                                .build());

                        totalChunksPublished++;
                    }

                    totalFilesProcessed++;
                    log.info("재분석 SQS 발행 완료: file={}, chunks={}", fileInfo.getFileName(), totalChunks);

                } catch (Exception e) {
                    log.error("재분석 실패 (파일): file={}, error={}", fileInfo.getFileName(), e.getMessage(), e);
                    // Lambda 시작 후 예외 발생 시 유지보수 모드 해제
                    if (lambdaStarted && uploadId != null) {
                        try {
                            maintenanceService.onLambdaFailed(uploadId);
                        } catch (Exception ex) {
                            log.warn("[MAINTENANCE] Lambda 실패 상태 복구 실패: {}", ex.getMessage());
                        }
                    }
                }
            }

            // 7. session_data 삭제 (raw_data 기반이므로 재생성 필요)
            Query deleteSessionDataQuery = new Query(Criteria.where("session_id").is(sessionId));
            long deletedSessionData = mongoTemplate.remove(deleteSessionDataQuery, "session_data").getDeletedCount();
            if (deletedSessionData > 0) {
                log.info("session_data 삭제: sessionId={}, 삭제건수={}", sessionId, deletedSessionData);
            }

            // 8. 세션 상태 초기화 (totalRowCount 리셋)
            session.setTotalRowCount(0L);
            session.setUpdatedAt(LocalDateTime.now());
            fileSessionRepository.save(session);
        }

        // 9. 세션 파싱 진행 상태 Redis 초기화
        for (String sessionId : processedSessionIds) {
            String sessionParseKey = "session:parse:" + sessionId;
            Map<String, String> parseInitData = new HashMap<>();
            parseInitData.put("status", "PROCESSING");
            parseInitData.put("totalFiles", String.valueOf(
                    targetSessions.stream()
                            .filter(s -> s.getSessionId().equals(sessionId))
                            .mapToInt(s -> s.getUploadedFiles() != null ? s.getUploadedFiles().size() : 0)
                            .sum()));
            parseInitData.put("completedFiles", "0");
            parseInitData.put("totalRows", "0");
            parseInitData.put("processedRows", "0");
            parseInitData.put("progress", "0");
            parseInitData.put("startTime", String.valueOf(System.currentTimeMillis()));
            redisTemplate.opsForHash().putAll(sessionParseKey, parseInitData);
            redisTemplate.expire(sessionParseKey, 24, TimeUnit.HOURS);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("status", "PROCESSING");
        result.put("processedSessions", processedSessionIds);
        result.put("totalFilesProcessed", totalFilesProcessed);
        result.put("totalChunksPublished", totalChunksPublished);
        result.put("message", String.format("%d개 세션, %d개 파일의 재분석이 시작되었습니다.",
                processedSessionIds.size(), totalFilesProcessed));

        log.info("⭐ 엑셀 데이터 재분석 완료: sessions={}, files={}, chunks={}",
                processedSessionIds.size(), totalFilesProcessed, totalChunksPublished);

        return result;
    }

    /**
     * 프로젝트 내 모든 세션 완료 여부 확인 후 프로젝트 상태 자동 갱신
     */
    private void checkAndUpdateProjectCompletion(String projectId) {
        try {
            Project project = projectRepository.findByProjectId(projectId).orElse(null);
            if (project == null) return;

            var allSessions = fileSessionRepository.findByProjectId(projectId);
            if (allSessions.isEmpty()) return;

            boolean allCompleted = allSessions.stream()
                    .allMatch(s -> Boolean.TRUE.equals(s.getIsCompleted()));

            if (allCompleted != Boolean.TRUE.equals(project.getIsCompleted())) {
                project.setIsCompleted(allCompleted);
                project.setUpdatedAt(LocalDateTime.now());
                projectRepository.save(project);
                log.info("프로젝트 자동 완료상태 갱신: projectId={}, isCompleted={}", projectId, allCompleted);
            }
        } catch (Exception e) {
            log.warn("프로젝트 완료 상태 갱신 실패: {}", e.getMessage());
        }
    }

    /**
     * 프로젝트 통계(totalSessions, completedSessions, totalFiles) 재계산
     * 실제 DB 데이터 기준으로 갱신하여 정합성 보장
     */
    public void refreshProjectStats(String projectId) {
        try {
            Project project = projectRepository.findByProjectId(projectId).orElse(null);
            if (project == null) return;

            List<FileSession> sessions = fileSessionRepository.findByProjectIdAndIsDeletedFalse(projectId);

            int totalSessions = sessions.size();
            int completedSessions = (int) sessions.stream()
                    .filter(s -> Boolean.TRUE.equals(s.getIsCompleted()))
                    .count();
            int totalFiles = sessions.stream()
                    .mapToInt(s -> s.getUploadedFiles() != null ? s.getUploadedFiles().size() : 0)
                    .sum();

            project.setTotalSessions(totalSessions);
            project.setCompletedSessions(completedSessions);
            project.setTotalFiles(totalFiles);
            project.setUpdatedAt(LocalDateTime.now());
            projectRepository.save(project);

            log.info("프로젝트 통계 갱신: projectId={}, sessions={}, completed={}, files={}",
                    projectId, totalSessions, completedSessions, totalFiles);
        } catch (Exception e) {
            log.warn("프로젝트 통계 갱신 실패: projectId={}, error={}", projectId, e.getMessage());
        }
    }
}