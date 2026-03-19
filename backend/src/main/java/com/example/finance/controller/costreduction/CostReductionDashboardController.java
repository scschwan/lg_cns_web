package com.example.finance.controller.costreduction;

import com.example.finance.dto.request.costreduction.TransitionPhaseRequest;
import com.example.finance.dto.response.costreduction.DashboardLockStatusResponse;
import com.example.finance.dto.response.costreduction.DashboardStatusResponse;
import com.example.finance.dto.response.costreduction.LockResponse;
import com.example.finance.enums.CostReductionPhase;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.costreduction.CostReductionDashboardService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/dashboard")
@RequiredArgsConstructor
/**
 * 원가절감 대시보드 컨트롤러
 *
 * 대시보드 초기화, 상태 조회, 편집자 잠금 제어,
 * 페이즈 전환(Long List / Short List / Task), 대시보드 초기화 등의 기능을 제공한다.
 *
 * Base Path: /api/projects/{projectId}/dashboard
 */
public class CostReductionDashboardController {

    private final CostReductionDashboardService dashboardService;

    /**
     * 대시보드 초기화 (최초 진입 시)
     *
     * @param projectId 프로젝트 ID
     * @param userPrincipal 인증된 사용자 정보
     * @return 대시보드 상태 응답
     */
    @PostMapping("/init")
    public ResponseEntity<DashboardStatusResponse> initDashboard(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        DashboardStatusResponse response = dashboardService.initDashboard(
                projectId, userPrincipal.getId(), userPrincipal.getUsername());
        return ResponseEntity.ok(response);
    }

    /**
     * 대시보드 상태 조회
     *
     * @param projectId 프로젝트 ID
     * @param userPrincipal 인증된 사용자 정보
     * @return 현재 페이즈, 잠금 상태 등
     */
    @GetMapping("/status")
    public ResponseEntity<DashboardStatusResponse> getStatus(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        DashboardStatusResponse response = dashboardService.getStatus(
                projectId, userPrincipal.getId());
        return ResponseEntity.ok(response);
    }

    /**
     * 편집자 잠금 획득
     */
    @PostMapping("/lock/acquire")
    public ResponseEntity<LockResponse> acquireLock(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        LockResponse response = dashboardService.acquireEditorLock(
                projectId, userPrincipal.getId(), userPrincipal.getUsername());
        return ResponseEntity.ok(response);
    }

    /**
     * 편집자 잠금 하트비트 (TTL 갱신)
     */
    @PostMapping("/lock/heartbeat")
    public ResponseEntity<Map<String, Boolean>> heartbeat(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        dashboardService.heartbeat(projectId, userPrincipal.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    /**
     * 편집자 잠금 해제
     */
    @PostMapping("/lock/release")
    public ResponseEntity<Map<String, Boolean>> releaseLock(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        dashboardService.releaseLock(projectId, userPrincipal.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    /**
     * 대시보드 페이즈 전환 (LONG_LIST, SHORT_LIST, TASK 등)
     *
     * @param projectId 프로젝트 ID
     * @param userPrincipal 인증된 사용자 정보
     * @param request 전환할 대상 페이즈 포함
     * @return 전환 후 대시보드 상태
     */
    @PostMapping("/transition")
    public ResponseEntity<DashboardStatusResponse> transitionPhase(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal,
            @Valid @RequestBody TransitionPhaseRequest request) {
        CostReductionPhase targetPhase = CostReductionPhase.valueOf(request.getTargetPhase());
        DashboardStatusResponse response = dashboardService.transitionPhase(
                projectId, userPrincipal.getId(), targetPhase);
        return ResponseEntity.ok(response);
    }

    /**
     * 리스트 잠금 해제 (Long List + Short List 동시 잠금 해제)
     */
    @PostMapping("/unlock-list")
    public ResponseEntity<DashboardStatusResponse> unlockList(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        DashboardStatusResponse response = dashboardService.unlockList(
                projectId, userPrincipal.getId());
        return ResponseEntity.ok(response);
    }

    /**
     * 대시보드 잠금 상태 확인 (세션 완료 시 사전 체크용)
     */
    @GetMapping("/lock-status")
    public ResponseEntity<DashboardLockStatusResponse> checkLockStatus(
            @PathVariable String projectId) {
        DashboardLockStatusResponse response = dashboardService.checkDashboardLockStatus(projectId);
        return ResponseEntity.ok(response);
    }

    /**
     * 대시보드 전체 초기화 (세션 재완료 시 기존 데이터 삭제)
     */
    @DeleteMapping("/reset")
    public ResponseEntity<Map<String, Boolean>> resetDashboard(
            @PathVariable String projectId) {
        dashboardService.resetAllDashboardData(projectId);
        return ResponseEntity.ok(Map.of("success", true));
    }
}
