package com.example.finance.controller.admin;

import com.example.finance.model.admin.AuditLog;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.admin.AdminService;
import com.example.finance.service.admin.MaintenanceService;
import com.example.finance.service.admin.S3AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private final S3AdminService s3AdminService;
    private final MaintenanceService maintenanceService;

    private void checkAdmin(UserPrincipal principal) {
        if (principal == null) {
            throw new RuntimeException("인증 정보가 없습니다");
        }
        // role은 DB에서 조회하여 체크 (JWT에 role 없음)
    }

    // ========== 사용자 관리 ==========

    @GetMapping("/users")
    public ResponseEntity<List<Map<String, Object>>> getAllUsers(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getAllUsers());
    }

    @PutMapping("/users/{userId}/approve")
    public ResponseEntity<Void> approveUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        checkAdmin(principal);
        adminService.approveUser(userId, principal.getId());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/users/{userId}/revoke")
    public ResponseEntity<Void> revokeUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        checkAdmin(principal);
        adminService.revokeUser(userId, principal.getId());
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Void> deleteUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        checkAdmin(principal);
        adminService.deleteUser(userId, principal.getId());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/users/bulk-approve")
    public ResponseEntity<Void> bulkApprove(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, List<String>> body) {
        checkAdmin(principal);
        adminService.bulkApprove(body.get("userIds"), principal.getId());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/users/bulk-revoke")
    public ResponseEntity<Void> bulkRevoke(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, List<String>> body) {
        checkAdmin(principal);
        adminService.bulkRevoke(body.get("userIds"), principal.getId());
        return ResponseEntity.ok().build();
    }

    // ========== 비밀번호 변경 ==========

    @PutMapping("/profile/password")
    public ResponseEntity<Void> changePassword(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, String> body) {
        checkAdmin(principal);
        adminService.changePassword(principal.getId(), body.get("currentPassword"), body.get("newPassword"));
        return ResponseEntity.ok().build();
    }

    @PutMapping("/users/{userId}/info")
    public ResponseEntity<Void> updateUserInfo(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId,
            @RequestBody Map<String, String> body) {
        checkAdmin(principal);
        adminService.updateUserInfo(userId, body.get("name"), body.get("email"), principal.getId());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/users/{userId}/password")
    public ResponseEntity<Void> resetUserPassword(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId,
            @RequestBody Map<String, String> body) {
        checkAdmin(principal);
        adminService.resetUserPassword(userId, body.get("newPassword"), principal.getId());
        return ResponseEntity.ok().build();
    }

    // ========== 프로젝트 관리 ==========

    @GetMapping("/projects")
    public ResponseEntity<List<Map<String, Object>>> getAllProjects(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getAllProjects());
    }

    @GetMapping("/projects/{projectId}")
    public ResponseEntity<Map<String, Object>> getProjectDetail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String projectId) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getProjectDetail(projectId));
    }

    @PutMapping("/projects/{projectId}/members/{userId}/role")
    public ResponseEntity<Void> updateMemberRole(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String projectId,
            @PathVariable String userId,
            @RequestBody Map<String, String> body) {
        checkAdmin(principal);
        adminService.updateMemberRole(projectId, userId, body.get("role"), principal.getId());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/projects/{projectId}/members")
    public ResponseEntity<Void> addProjectMember(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String projectId,
            @RequestBody Map<String, String> body) {
        checkAdmin(principal);
        adminService.addProjectMember(projectId, body.get("userId"), body.get("role"), principal.getId());
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/projects/{projectId}/members/{userId}")
    public ResponseEntity<Void> removeProjectMember(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String projectId,
            @PathVariable String userId) {
        checkAdmin(principal);
        adminService.removeProjectMember(projectId, userId, principal.getId());
        return ResponseEntity.ok().build();
    }

    // ========== S3 파일 관리 ==========

    @GetMapping("/s3/files")
    public ResponseEntity<List<Map<String, Object>>> listS3Files(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(s3AdminService.listAllFiles());
    }

    @GetMapping("/s3/orphaned")
    public ResponseEntity<List<Map<String, Object>>> getOrphanedFiles(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(s3AdminService.findOrphanedFiles());
    }

    @DeleteMapping("/s3/files")
    public ResponseEntity<Map<String, Object>> deleteS3Files(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, List<String>> body) {
        checkAdmin(principal);
        int deleted = s3AdminService.deleteFiles(body.get("s3Keys"));
        return ResponseEntity.ok(Map.of("deletedCount", deleted));
    }

    @PostMapping("/s3/cleanup")
    public ResponseEntity<Map<String, Object>> cleanupOrphaned(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        int deleted = s3AdminService.cleanupOrphaned();
        return ResponseEntity.ok(Map.of("deletedCount", deleted));
    }

    // ========== 세션 모니터링 ==========

    @GetMapping("/sessions")
    public ResponseEntity<List<Map<String, Object>>> getAllSessions(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getAllSessions());
    }

    @PostMapping("/sessions/{sessionId}/reset")
    public ResponseEntity<Void> resetSession(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String sessionId) {
        checkAdmin(principal);
        adminService.resetSession(sessionId, principal.getId());
        return ResponseEntity.ok().build();
    }

    // ========== 대시보드 ==========

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getStats());
    }

    // ========== 감사 로그 ==========

    @GetMapping("/logs")
    public ResponseEntity<List<AuditLog>> getLogs(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) String targetId) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getLogs(targetType, targetId));
    }

    // ========== 사용자 활동 로그 (비관리자도 호출 가능) ==========

    @PostMapping("/user-activity")
    public ResponseEntity<Void> logUserActivity(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, String> body) {
        if (principal == null) return ResponseEntity.ok().build();
        adminService.logUserActivity(
                principal.getId(),
                body.get("action"),
                body.get("targetType"),
                body.get("targetId"),
                body.get("detail")
        );
        return ResponseEntity.ok().build();
    }

    // ========== 유지보수 모드 관리 ==========

    /**
     * 유지보수 모드 on/off 제어 (관리자 전용)
     *
     * POST /api/admin/maintenance-mode
     * Body: { "enabled": true/false, "reason": "..." }
     */
    @PostMapping("/maintenance-mode")
    public ResponseEntity<Map<String, Object>> setMaintenanceMode(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, Object> body) {
        checkAdmin(principal);
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        String reason = (String) body.get("reason");
        Map<String, Object> result = maintenanceService.setMaintenanceMode(enabled, reason, principal.getId());
        return ResponseEntity.ok(result);
    }
}
