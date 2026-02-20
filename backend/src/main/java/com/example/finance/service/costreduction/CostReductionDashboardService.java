package com.example.finance.service.costreduction;

import com.example.finance.dto.response.costreduction.DashboardStatusResponse;
import com.example.finance.dto.response.costreduction.LockResponse;
import com.example.finance.enums.CostReductionPhase;
import com.example.finance.model.costreduction.CostReductionDashboard;
import com.example.finance.repository.costreduction.CostReductionDashboardRepository;
import com.example.finance.service.common.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class CostReductionDashboardService {

    private final CostReductionDashboardRepository dashboardRepository;
    private final RedisService redisService;

    private static final String LOCK_KEY_PREFIX = "dashboard:lock:";
    private static final Duration LOCK_TTL = Duration.ofSeconds(60);

    /**
     * 대시보드 초기화 (최초 진입 시 문서 생성 + 편집자 잠금 시도)
     */
    public DashboardStatusResponse initDashboard(String projectId, String userId, String userName) {
        CostReductionDashboard dashboard = dashboardRepository.findByProjectId(projectId)
                .orElseGet(() -> {
                    CostReductionDashboard newDashboard = CostReductionDashboard.builder()
                            .projectId(projectId)
                            .currentPhase(CostReductionPhase.LONG_LIST.name())
                            .isListLocked(false)
                            .createdAt(LocalDateTime.now())
                            .updatedAt(LocalDateTime.now())
                            .build();
                    return dashboardRepository.save(newDashboard);
                });

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
        CostReductionDashboard dashboard = getDashboard(projectId);

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
            CostReductionDashboard dashboard = getDashboard(projectId);
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
        CostReductionDashboard dashboard = getDashboard(projectId);
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

            // MongoDB 하트비트 시간 갱신
            CostReductionDashboard dashboard = getDashboard(projectId);
            dashboard.setEditorHeartbeatAt(LocalDateTime.now());
            dashboard.setUpdatedAt(LocalDateTime.now());
            dashboardRepository.save(dashboard);
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

            CostReductionDashboard dashboard = getDashboard(projectId);
            dashboard.setEditorUserId(null);
            dashboard.setEditorUserName(null);
            dashboard.setEditorAcquiredAt(null);
            dashboard.setEditorHeartbeatAt(null);
            dashboard.setUpdatedAt(LocalDateTime.now());
            dashboardRepository.save(dashboard);

            log.info("Editor lock released: projectId={}, userId={}", projectId, userId);
        }
    }

    /**
     * 단계 전환
     */
    public DashboardStatusResponse transitionPhase(String projectId, String userId,
                                                    CostReductionPhase targetPhase) {
        CostReductionDashboard dashboard = getDashboard(projectId);

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

    private CostReductionDashboard getDashboard(String projectId) {
        return dashboardRepository.findByProjectId(projectId)
                .orElseThrow(() -> new RuntimeException("대시보드를 찾을 수 없습니다: " + projectId));
    }
}
