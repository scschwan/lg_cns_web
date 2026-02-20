package com.example.finance.service.costreduction;

import com.example.finance.dto.response.costreduction.DashboardLockStatusResponse;
import com.example.finance.dto.response.costreduction.DashboardStatusResponse;
import com.example.finance.dto.response.costreduction.LockResponse;
import com.example.finance.enums.CostReductionPhase;
import com.example.finance.model.costreduction.AbleTask;
import com.example.finance.model.costreduction.CostReductionDashboard;
import com.example.finance.model.costreduction.TaskDocument;
import com.example.finance.repository.costreduction.AbleTaskRepository;
import com.example.finance.repository.costreduction.CostReductionDashboardRepository;
import com.example.finance.repository.costreduction.LongShortListRepository;
import com.example.finance.repository.costreduction.TaskDocumentRepository;
import com.example.finance.service.common.RedisService;
import com.example.finance.service.common.S3Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class CostReductionDashboardService {

    private final CostReductionDashboardRepository dashboardRepository;
    private final LongShortListRepository longShortListRepository;
    private final AbleTaskRepository ableTaskRepository;
    private final TaskDocumentRepository taskDocumentRepository;
    private final RedisService redisService;
    private final S3Service s3Service;

    private static final String LOCK_KEY_PREFIX = "dashboard:lock:";
    private static final Duration LOCK_TTL = Duration.ofSeconds(60);

    /**
     * 대시보드 초기화 (최초 진입 시 문서 생성 + 편집자 잠금 시도)
     */
    public DashboardStatusResponse initDashboard(String projectId, String userId, String userName) {
        CostReductionDashboard dashboard = getOrCreateDashboard(projectId);

        // 편집자 잠금 시도
        LockResponse lockResponse = acquireEditorLock(projectId, userId, userName);

        return DashboardStatusResponse.builder()
                .projectId(projectId)
                .currentPhase(dashboard.getCurrentPhase())
                .isListLocked(dashboard.getIsListLocked())
                .isEditor(lockResponse.getIsEditor())
                .editorUserId(lockResponse.getEditorUserId())
                .editorUserName(lockResponse.getEditorUserName())
                .build();
    }

    /**
     * 대시보드 상태 조회
     */
    public DashboardStatusResponse getStatus(String projectId, String userId) {
        CostReductionDashboard dashboard = getOrCreateDashboard(projectId);

        String lockKey = LOCK_KEY_PREFIX + projectId;
        Object currentEditor = redisService.get(lockKey);
        boolean isEditor = userId.equals(currentEditor);

        return DashboardStatusResponse.builder()
                .projectId(projectId)
                .currentPhase(dashboard.getCurrentPhase())
                .isListLocked(dashboard.getIsListLocked())
                .isEditor(isEditor)
                .editorUserId(dashboard.getEditorUserId())
                .editorUserName(dashboard.getEditorUserName())
                .build();
    }

    /**
     * 편집자 잠금 획득 (Redis SET NX + MongoDB 저장)
     */
    public LockResponse acquireEditorLock(String projectId, String userId, String userName) {
        String lockKey = LOCK_KEY_PREFIX + projectId;

        // Redis SET NX 시도
        Boolean acquired = redisService.setIfAbsent(lockKey, userId, LOCK_TTL);

        if (Boolean.TRUE.equals(acquired)) {
            // 잠금 획득 성공 → MongoDB에도 편집자 정보 저장
            CostReductionDashboard dashboard = getOrCreateDashboard(projectId);
            dashboard.setEditorUserId(userId);
            dashboard.setEditorUserName(userName);
            dashboard.setEditorAcquiredAt(LocalDateTime.now());
            dashboard.setEditorHeartbeatAt(LocalDateTime.now());
            dashboard.setUpdatedAt(LocalDateTime.now());
            dashboardRepository.save(dashboard);

            log.info("Editor lock acquired: projectId={}, userId={}", projectId, userId);
            return LockResponse.builder()
                    .isEditor(true)
                    .editorUserId(userId)
                    .editorUserName(userName)
                    .build();
        }

        // 이미 잠금이 있음 → 현재 편집자가 본인인지 확인
        Object currentEditor = redisService.get(lockKey);
        if (userId.equals(currentEditor)) {
            // 본인이 이미 편집자 → TTL 갱신
            redisService.expire(lockKey, LOCK_TTL);
            return LockResponse.builder()
                    .isEditor(true)
                    .editorUserId(userId)
                    .editorUserName(userName)
                    .build();
        }

        // 다른 사람이 편집자
        CostReductionDashboard dashboard = getOrCreateDashboard(projectId);
        log.info("Editor lock denied: projectId={}, requestor={}, currentEditor={}",
                projectId, userId, currentEditor);
        return LockResponse.builder()
                .isEditor(false)
                .editorUserId(dashboard.getEditorUserId())
                .editorUserName(dashboard.getEditorUserName())
                .build();
    }

    /**
     * 하트비트 (Redis TTL 갱신)
     */
    public void heartbeat(String projectId, String userId) {
        String lockKey = LOCK_KEY_PREFIX + projectId;
        Object currentEditor = redisService.get(lockKey);

        if (userId.equals(currentEditor)) {
            redisService.expire(lockKey, LOCK_TTL);

            // MongoDB 하트비트 시간 갱신 (대시보드 존재 시에만)
            dashboardRepository.findByProjectId(projectId).ifPresent(dashboard -> {
                dashboard.setEditorHeartbeatAt(LocalDateTime.now());
                dashboard.setUpdatedAt(LocalDateTime.now());
                dashboardRepository.save(dashboard);
            });
        } else {
            log.warn("Heartbeat from non-editor: projectId={}, userId={}", projectId, userId);
        }
    }

    /**
     * 편집자 잠금 해제 (Redis DEL + MongoDB 편집자 정보 삭제)
     */
    public void releaseLock(String projectId, String userId) {
        String lockKey = LOCK_KEY_PREFIX + projectId;
        Object currentEditor = redisService.get(lockKey);

        if (userId.equals(currentEditor)) {
            redisService.delete(lockKey);

            // MongoDB 편집자 정보 삭제 (대시보드 존재 시에만)
            dashboardRepository.findByProjectId(projectId).ifPresent(dashboard -> {
                dashboard.setEditorUserId(null);
                dashboard.setEditorUserName(null);
                dashboard.setEditorAcquiredAt(null);
                dashboard.setEditorHeartbeatAt(null);
                dashboard.setUpdatedAt(LocalDateTime.now());
                dashboardRepository.save(dashboard);
            });

            log.info("Editor lock released: projectId={}, userId={}", projectId, userId);
        }
    }

    /**
     * 단계 전환
     */
    public DashboardStatusResponse transitionPhase(String projectId, String userId,
                                                    CostReductionPhase targetPhase) {
        CostReductionDashboard dashboard = getOrCreateDashboard(projectId);

        // ABLE_REGISTER 전환 시 리스트 잠금
        if (targetPhase == CostReductionPhase.ABLE_REGISTER) {
            dashboard.setIsListLocked(true);
        }

        dashboard.setCurrentPhase(targetPhase.name());
        dashboard.setUpdatedAt(LocalDateTime.now());
        dashboardRepository.save(dashboard);

        log.info("Phase transitioned: projectId={}, newPhase={}", projectId, targetPhase);

        String lockKey = LOCK_KEY_PREFIX + projectId;
        Object currentEditor = redisService.get(lockKey);
        boolean isEditor = userId.equals(currentEditor);

        return DashboardStatusResponse.builder()
                .projectId(projectId)
                .currentPhase(dashboard.getCurrentPhase())
                .isListLocked(dashboard.getIsListLocked())
                .isEditor(isEditor)
                .editorUserId(dashboard.getEditorUserId())
                .editorUserName(dashboard.getEditorUserName())
                .build();
    }

    /**
     * 대시보드 잠금 상태 확인 (세션 완료 시 사전 체크용)
     * - 대시보드 존재 여부 + 현재 편집자 잠금 여부 반환
     */
    public DashboardLockStatusResponse checkDashboardLockStatus(String projectId) {
        boolean exists = dashboardRepository.existsByProjectId(projectId);
        if (!exists) {
            return DashboardLockStatusResponse.builder()
                    .dashboardExists(false)
                    .isLocked(false)
                    .build();
        }

        CostReductionDashboard dashboard = getOrCreateDashboard(projectId);
        String lockKey = LOCK_KEY_PREFIX + projectId;
        Object currentEditor = redisService.get(lockKey);
        boolean isLocked = currentEditor != null;

        return DashboardLockStatusResponse.builder()
                .dashboardExists(true)
                .isLocked(isLocked)
                .editorUserId(isLocked ? String.valueOf(currentEditor) : dashboard.getEditorUserId())
                .editorUserName(isLocked ? dashboard.getEditorUserName() : null)
                .currentPhase(dashboard.getCurrentPhase())
                .build();
    }

    /**
     * 대시보드 전체 초기화 (DB + S3 + Redis 캐시)
     * - cost_reduction_dashboards 삭제
     * - long_short_lists 삭제
     * - able_tasks + task_documents 삭제
     * - S3 task documents 삭제
     * - Redis 캐시 삭제
     */
    public void resetAllDashboardData(String projectId) {
        log.info("Dashboard 전체 초기화 시작: projectId={}", projectId);

        // 1. Task Documents S3 파일 삭제
        List<AbleTask> tasks = ableTaskRepository.findByProjectId(projectId);
        for (AbleTask task : tasks) {
            List<TaskDocument> docs = taskDocumentRepository.findByTaskId(task.getId());
            for (TaskDocument doc : docs) {
                if ("file".equals(doc.getType()) && doc.getS3Key() != null) {
                    try {
                        s3Service.deleteFile(doc.getS3Key());
                    } catch (Exception e) {
                        log.warn("Failed to delete S3 file: key={}", doc.getS3Key(), e);
                    }
                }
            }
            // Task Documents DB 삭제
            taskDocumentRepository.deleteByTaskId(task.getId());
        }

        // 2. Able Tasks 삭제
        ableTaskRepository.deleteAll(tasks);
        log.info("Deleted {} tasks and their documents for projectId={}", tasks.size(), projectId);

        // 3. S3 task 폴더 삭제 (일괄)
        try {
            s3Service.deleteFolder("projects/" + projectId + "/tasks/");
        } catch (Exception e) {
            log.warn("Failed to delete S3 task folder: projectId={}", projectId, e);
        }

        // 4. Long/Short List 삭제
        longShortListRepository.findByProjectId(projectId)
                .ifPresent(longShortListRepository::delete);
        log.info("Deleted long/short list for projectId={}", projectId);

        // 5. Dashboard 삭제
        dashboardRepository.findByProjectId(projectId)
                .ifPresent(dashboardRepository::delete);
        log.info("Deleted dashboard for projectId={}", projectId);

        // 6. Redis 캐시 정리
        redisService.delete(LOCK_KEY_PREFIX + projectId);

        // Long List / Short List 캐시 삭제
        Set<String> cacheKeys = redisService.keys("longlist:*:" + projectId);
        if (cacheKeys != null && !cacheKeys.isEmpty()) {
            redisService.delete(cacheKeys);
        }
        Set<String> shortCacheKeys = redisService.keys("shortlist:*:" + projectId);
        if (shortCacheKeys != null && !shortCacheKeys.isEmpty()) {
            redisService.delete(shortCacheKeys);
        }

        log.info("Dashboard 전체 초기화 완료: projectId={}", projectId);
    }

    /**
     * 대시보드 조회 (없으면 자동 생성)
     */
    private CostReductionDashboard getOrCreateDashboard(String projectId) {
        return dashboardRepository.findByProjectId(projectId)
                .orElseGet(() -> {
                    log.info("Dashboard auto-created for projectId={}", projectId);
                    CostReductionDashboard newDashboard = CostReductionDashboard.builder()
                            .projectId(projectId)
                            .currentPhase(CostReductionPhase.LONG_LIST.name())
                            .isListLocked(false)
                            .createdAt(LocalDateTime.now())
                            .updatedAt(LocalDateTime.now())
                            .build();
                    return dashboardRepository.save(newDashboard);
                });
    }
}
