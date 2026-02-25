package com.example.finance.controller.common;

import com.example.finance.service.admin.MaintenanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 시스템 상태 조회 컨트롤러
 *
 * 모든 사용자(인증된 사용자)가 접근 가능한 시스템 상태 API
 */
@Slf4j
@RestController
@RequestMapping("/api/system")
@RequiredArgsConstructor
public class SystemController {

    private final MaintenanceService maintenanceService;

    /**
     * 현재 유지보수/Lambda 상태 조회
     *
     * GET /api/system/maintenance-status
     * - 모든 인증된 사용자 접근 가능
     */
    @GetMapping("/maintenance-status")
    public ResponseEntity<Map<String, Object>> getMaintenanceStatus() {
        log.debug("유지보수 상태 조회");
        Map<String, Object> status = maintenanceService.getMaintenanceStatus();
        return ResponseEntity.ok(status);
    }

    /**
     * Lambda worker 업로드 진행률 조회
     *
     * GET /api/system/upload-progress
     * - 모든 인증된 사용자 접근 가능
     */
    @GetMapping("/upload-progress")
    public ResponseEntity<Map<String, Object>> getUploadProgress() {
        log.debug("Lambda 업로드 진행률 조회");
        Map<String, Object> progress = maintenanceService.getUploadProgress();
        return ResponseEntity.ok(progress);
    }
}
