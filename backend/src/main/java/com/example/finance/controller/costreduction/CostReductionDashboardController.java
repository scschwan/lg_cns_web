package com.example.finance.controller.costreduction;

import com.example.finance.dto.request.costreduction.TransitionPhaseRequest;
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
public class CostReductionDashboardController {

    private final CostReductionDashboardService dashboardService;

    @PostMapping("/init")
    public ResponseEntity<DashboardStatusResponse> initDashboard(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        DashboardStatusResponse response = dashboardService.initDashboard(
                projectId, userPrincipal.getId(), userPrincipal.getUsername());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/status")
    public ResponseEntity<DashboardStatusResponse> getStatus(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        DashboardStatusResponse response = dashboardService.getStatus(
                projectId, userPrincipal.getId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/lock/acquire")
    public ResponseEntity<LockResponse> acquireLock(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        LockResponse response = dashboardService.acquireEditorLock(
                projectId, userPrincipal.getId(), userPrincipal.getUsername());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/lock/heartbeat")
    public ResponseEntity<Map<String, Boolean>> heartbeat(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        dashboardService.heartbeat(projectId, userPrincipal.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/lock/release")
    public ResponseEntity<Map<String, Boolean>> releaseLock(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        dashboardService.releaseLock(projectId, userPrincipal.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

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
}
