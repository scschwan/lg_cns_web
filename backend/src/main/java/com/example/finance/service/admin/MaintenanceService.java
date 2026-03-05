package com.example.finance.service.admin;

import com.example.finance.model.admin.MaintenanceStatus;
import com.example.finance.repository.admin.MaintenanceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 시스템 유지보수 모드 서비스
 *
 * - 관리자가 수동으로 유지보수 모드 on/off
 * - Lambda worker 작업 시 자동 유지보수 모드 연동
 * - 단일 도큐먼트 (id = "singleton") 로 상태 관리
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MaintenanceService {

    private final MaintenanceRepository maintenanceRepository;

    private static final String SINGLETON_ID = "singleton";

    /** Lambda 작업 타임아웃 시간 (2시간) - 이 시간 초과 시 자동 복구 */
    private static final Duration LAMBDA_TIMEOUT = Duration.ofHours(2);

    /**
     * 현재 유지보수/Lambda 상태 조회
     */
    public Map<String, Object> getMaintenanceStatus() {
        MaintenanceStatus status = getOrCreate();
        return toResponseMap(status);
    }

    /**
     * 관리자 수동 유지보수 모드 설정
     *
     * @param enabled 활성화 여부
     * @param reason  이유 (선택)
     * @param adminId 관리자 ID
     */
    public Map<String, Object> setMaintenanceMode(boolean enabled, String reason, String adminId) {
        MaintenanceStatus status = getOrCreate();

        status.setIsMaintenance(enabled);
        status.setReason(reason);
        status.setUpdatedBy(adminId);
        status.setUpdatedAt(LocalDateTime.now());

        if (enabled) {
            status.setStartedAt(LocalDateTime.now());
            status.setEndedAt(null);
            log.info("[MAINTENANCE] 유지보수 모드 활성화: adminId={}, reason={}", adminId, reason);
        } else {
            status.setEndedAt(LocalDateTime.now());
            log.info("[MAINTENANCE] 유지보수 모드 비활성화: adminId={}", adminId);
        }

        maintenanceRepository.save(status);
        return toResponseMap(status);
    }

    /**
     * Lambda worker 작업 시작 시 유지보수 모드 자동 활성화
     *
     * @param uploadId Lambda 작업 uploadId
     */
    public void onLambdaStart(String uploadId) {
        MaintenanceStatus status = getOrCreate();

        status.setIsLambdaRunning(true);
        status.setCurrentUploadId(uploadId);
        status.setLambdaProgress(0);
        status.setLambdaStartedAt(LocalDateTime.now());
        status.setLambdaCompletedAt(null);
        status.setUpdatedAt(LocalDateTime.now());

        maintenanceRepository.save(status);
        log.info("[MAINTENANCE] Lambda 작업 시작: uploadId={}", uploadId);
    }

    /**
     * Lambda worker 작업 완료 시 유지보수 모드 자동 비활성화
     *
     * @param uploadId Lambda 작업 uploadId
     */
    public void onLambdaComplete(String uploadId) {
        MaintenanceStatus status = getOrCreate();

        status.setIsLambdaRunning(false);
        status.setLambdaProgress(100);
        status.setLambdaCompletedAt(LocalDateTime.now());
        status.setUpdatedAt(LocalDateTime.now());

        if (uploadId != null && uploadId.equals(status.getCurrentUploadId())) {
            status.setCurrentUploadId(null);
        }

        maintenanceRepository.save(status);
        log.info("[MAINTENANCE] Lambda 작업 완료: uploadId={}", uploadId);
    }

    /**
     * Lambda worker 진행률 업데이트
     *
     * @param uploadId Lambda 작업 uploadId
     * @param progress 진행률 (0~100)
     */
    public void updateLambdaProgress(String uploadId, int progress) {
        MaintenanceStatus status = getOrCreate();

        if (uploadId != null && uploadId.equals(status.getCurrentUploadId())) {
            status.setLambdaProgress(progress);
            status.setUpdatedAt(LocalDateTime.now());
            maintenanceRepository.save(status);
            log.debug("[MAINTENANCE] Lambda 진행률 업데이트: uploadId={}, progress={}%", uploadId, progress);
        }
    }

    /**
     * 현재 유지보수 모드 활성 여부 확인
     * (미들웨어에서 사용)
     *
     * Lambda 작업이 LAMBDA_TIMEOUT 이상 지속되면 비정상 종료로 판단하고 자동 복구
     */
    public boolean isMaintenanceActive() {
        MaintenanceStatus status = getOrCreate();

        // Lambda 타임아웃 자동 복구
        if (Boolean.TRUE.equals(status.getIsLambdaRunning()) && isLambdaTimedOut(status)) {
            log.warn("[MAINTENANCE] Lambda 작업 타임아웃 감지 ({}시간 초과), 자동 복구: uploadId={}",
                    LAMBDA_TIMEOUT.toHours(), status.getCurrentUploadId());
            autoRecoverLambdaState(status);
            return Boolean.TRUE.equals(status.getIsMaintenance());
        }

        return Boolean.TRUE.equals(status.getIsMaintenance())
                || Boolean.TRUE.equals(status.getIsLambdaRunning());
    }

    /**
     * Lambda 업로드 진행 상태 조회
     */
    public Map<String, Object> getUploadProgress() {
        MaintenanceStatus status = getOrCreate();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("isLambdaRunning", status.getIsLambdaRunning());
        result.put("currentUploadId", status.getCurrentUploadId());
        result.put("lambdaProgress", status.getLambdaProgress());
        result.put("lambdaStartedAt", status.getLambdaStartedAt());
        result.put("lambdaCompletedAt", status.getLambdaCompletedAt());
        return result;
    }

    /**
     * Lambda 실패 시 유지보수 모드 자동 비활성화
     */
    public void onLambdaFailed(String uploadId) {
        MaintenanceStatus status = getOrCreate();

        status.setIsLambdaRunning(false);
        status.setLambdaCompletedAt(LocalDateTime.now());
        status.setUpdatedAt(LocalDateTime.now());

        if (uploadId != null && uploadId.equals(status.getCurrentUploadId())) {
            status.setCurrentUploadId(null);
        }

        maintenanceRepository.save(status);
        log.warn("[MAINTENANCE] Lambda 작업 실패로 유지보수 모드 해제: uploadId={}", uploadId);
    }

    /**
     * Lambda 상태 강제 초기화 (관리자 수동)
     * is_lambda_running → false, current_upload_id → null 등 초기화
     */
    public Map<String, Object> resetLambdaStatus(String adminId) {
        MaintenanceStatus status = getOrCreate();

        boolean wasRunning = Boolean.TRUE.equals(status.getIsLambdaRunning());
        String prevUploadId = status.getCurrentUploadId();

        status.setIsLambdaRunning(false);
        status.setCurrentUploadId(null);
        status.setLambdaProgress(0);
        status.setLambdaCompletedAt(LocalDateTime.now());
        status.setUpdatedBy(adminId);
        status.setUpdatedAt(LocalDateTime.now());

        maintenanceRepository.save(status);
        log.info("[MAINTENANCE] Lambda 상태 수동 초기화: adminId={}, wasRunning={}, prevUploadId={}",
                adminId, wasRunning, prevUploadId);

        return toResponseMap(status);
    }

    // ===== 내부 헬퍼 =====

    private boolean isLambdaTimedOut(MaintenanceStatus status) {
        LocalDateTime startedAt = status.getLambdaStartedAt();
        if (startedAt == null) {
            return true;
        }
        return Duration.between(startedAt, LocalDateTime.now()).compareTo(LAMBDA_TIMEOUT) > 0;
    }

    private void autoRecoverLambdaState(MaintenanceStatus status) {
        status.setIsLambdaRunning(false);
        status.setLambdaCompletedAt(LocalDateTime.now());
        status.setCurrentUploadId(null);
        status.setUpdatedAt(LocalDateTime.now());
        maintenanceRepository.save(status);
        log.info("[MAINTENANCE] Lambda 상태 자동 복구 완료");
    }

    private MaintenanceStatus getOrCreate() {
        return maintenanceRepository.findById(SINGLETON_ID)
                .orElseGet(() -> {
                    MaintenanceStatus initial = MaintenanceStatus.builder()
                            .id(SINGLETON_ID)
                            .isMaintenance(false)
                            .isLambdaRunning(false)
                            .lambdaProgress(0)
                            .updatedAt(LocalDateTime.now())
                            .build();
                    return maintenanceRepository.save(initial);
                });
    }

    private Map<String, Object> toResponseMap(MaintenanceStatus status) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("isMaintenance", status.getIsMaintenance());
        map.put("reason", status.getReason());
        map.put("startedAt", status.getStartedAt());
        map.put("endedAt", status.getEndedAt());
        map.put("updatedBy", status.getUpdatedBy());
        map.put("updatedAt", status.getUpdatedAt());
        map.put("isLambdaRunning", status.getIsLambdaRunning());
        map.put("currentUploadId", status.getCurrentUploadId());
        map.put("lambdaProgress", status.getLambdaProgress());
        map.put("lambdaStartedAt", status.getLambdaStartedAt());
        map.put("lambdaCompletedAt", status.getLambdaCompletedAt());
        // 서비스 접근 가능 여부 (유지보수 모드 OR Lambda 실행 중이면 접근 불가)
        map.put("isServiceAvailable",
                !Boolean.TRUE.equals(status.getIsMaintenance())
                && !Boolean.TRUE.equals(status.getIsLambdaRunning()));
        return map;
    }
}
