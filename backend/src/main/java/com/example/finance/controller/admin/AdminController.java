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

/**
 * 관리자 컨트롤러
 *
 * 시스템 관리자 전용 API를 제공한다.
 * 사용자 관리(승인/취소/삭제), 프로젝트 관리(멤버 역할 변경),
 * S3 파일 관리, 세션 모니터링, 감사 로그 조회, 유지보수 모드 제어 등의 기능을 포함한다.
 *
 * Base Path: /api/admin
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private final S3AdminService s3AdminService;
    private final MaintenanceService maintenanceService;

    /**
     * 관리자 권한 확인
     *
     * @param principal 현재 인증된 사용자 정보
     * @throws RuntimeException 인증 정보가 없는 경우
     */
    private void checkAdmin(UserPrincipal principal) {
        if (principal == null) {
            throw new RuntimeException("인증 정보가 없습니다");
        }
        // role은 DB에서 조회하여 체크 (JWT에 role 없음)
    }

    // ========== 사용자 관리 ==========

    /**
     * 전체 사용자 목록 조회
     *
     * @param principal 관리자 인증 정보
     * @return 전체 사용자 목록
     */
    @GetMapping("/users")
    public ResponseEntity<List<Map<String, Object>>> getAllUsers(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getAllUsers());
    }

    /**
     * 사용자 승인 처리
     *
     * @param principal 관리자 인증 정보
     * @param userId 승인할 사용자 ID
     * @return 200 OK
     */
    @PutMapping("/users/{userId}/approve")
    public ResponseEntity<Void> approveUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        checkAdmin(principal);
        adminService.approveUser(userId, principal.getId());
        return ResponseEntity.ok().build();
    }

    /**
     * 사용자 승인 취소
     *
     * @param principal 관리자 인증 정보
     * @param userId 승인 취소할 사용자 ID
     * @return 200 OK
     */
    @PutMapping("/users/{userId}/revoke")
    public ResponseEntity<Void> revokeUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        checkAdmin(principal);
        adminService.revokeUser(userId, principal.getId());
        return ResponseEntity.ok().build();
    }

    /**
     * 사용자 삭제
     *
     * @param principal 관리자 인증 정보
     * @param userId 삭제할 사용자 ID
     * @return 200 OK
     */
    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Void> deleteUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        checkAdmin(principal);
        adminService.deleteUser(userId, principal.getId());
        return ResponseEntity.ok().build();
    }

    /**
     * 사용자 일괄 승인
     *
     * @param principal 관리자 인증 정보
     * @param body userIds 키로 사용자 ID 목록 포함
     * @return 200 OK
     */
    @PutMapping("/users/bulk-approve")
    public ResponseEntity<Void> bulkApprove(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, List<String>> body) {
        checkAdmin(principal);
        adminService.bulkApprove(body.get("userIds"), principal.getId());
        return ResponseEntity.ok().build();
    }

    /**
     * 사용자 일괄 승인 취소
     *
     * @param principal 관리자 인증 정보
     * @param body userIds 키로 사용자 ID 목록 포함
     * @return 200 OK
     */
    @PutMapping("/users/bulk-revoke")
    public ResponseEntity<Void> bulkRevoke(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, List<String>> body) {
        checkAdmin(principal);
        adminService.bulkRevoke(body.get("userIds"), principal.getId());
        return ResponseEntity.ok().build();
    }

    // ========== 비밀번호 변경 ==========

    /**
     * 관리자 비밀번호 변경
     *
     * @param principal 관리자 인증 정보
     * @param body currentPassword, newPassword 포함
     * @return 200 OK
     */
    @PutMapping("/profile/password")
    public ResponseEntity<Void> changePassword(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, String> body) {
        checkAdmin(principal);
        adminService.changePassword(principal.getId(), body.get("currentPassword"), body.get("newPassword"));
        return ResponseEntity.ok().build();
    }

    /**
     * 사용자 정보 수정 (이름, 이메일)
     *
     * @param principal 관리자 인증 정보
     * @param userId 대상 사용자 ID
     * @param body name, email 포함
     * @return 200 OK
     */
    @PutMapping("/users/{userId}/info")
    public ResponseEntity<Void> updateUserInfo(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId,
            @RequestBody Map<String, String> body) {
        checkAdmin(principal);
        adminService.updateUserInfo(userId, body.get("name"), body.get("email"), principal.getId());
        return ResponseEntity.ok().build();
    }

    /**
     * 사용자 비밀번호 초기화 (관리자 전용)
     *
     * @param principal 관리자 인증 정보
     * @param userId 대상 사용자 ID
     * @param body newPassword 포함
     * @return 200 OK
     */
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

    /**
     * 전체 프로젝트 목록 조회
     *
     * @param principal 관리자 인증 정보
     * @return 프로젝트 목록 (삭제된 프로젝트 제외)
     */
    @GetMapping("/projects")
    public ResponseEntity<List<Map<String, Object>>> getAllProjects(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getAllProjects());
    }

    /**
     * 프로젝트 상세 정보 조회 (멤버 포함)
     *
     * @param principal 관리자 인증 정보
     * @param projectId 프로젝트 ID
     * @return 프로젝트 상세 정보
     */
    @GetMapping("/projects/{projectId}")
    public ResponseEntity<Map<String, Object>> getProjectDetail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String projectId) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getProjectDetail(projectId));
    }

    /**
     * 프로젝트 멤버 역할 변경
     *
     * @param principal 관리자 인증 정보
     * @param projectId 프로젝트 ID
     * @param userId 대상 멤버 ID
     * @param body role 포함 (OWNER, EDITOR, VIEWER)
     * @return 200 OK
     */
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

    /**
     * 프로젝트에 멤버 추가
     *
     * @param principal 관리자 인증 정보
     * @param projectId 프로젝트 ID
     * @param body userId, role 포함
     * @return 200 OK
     */
    @PostMapping("/projects/{projectId}/members")
    public ResponseEntity<Void> addProjectMember(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String projectId,
            @RequestBody Map<String, String> body) {
        checkAdmin(principal);
        adminService.addProjectMember(projectId, body.get("userId"), body.get("role"), principal.getId());
        return ResponseEntity.ok().build();
    }

    /**
     * 프로젝트에서 멤버 제거
     *
     * @param principal 관리자 인증 정보
     * @param projectId 프로젝트 ID
     * @param userId 제거할 멤버 ID
     * @return 200 OK
     */
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

    /**
     * S3 전체 파일 목록 조회
     *
     * @param principal 관리자 인증 정보
     * @return S3 버킷 내 전체 파일 목록
     */
    @GetMapping("/s3/files")
    public ResponseEntity<List<Map<String, Object>>> listS3Files(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(s3AdminService.listAllFiles());
    }

    /**
     * 고아 파일 목록 조회 (세션에 연결되지 않은 S3 파일)
     *
     * @param principal 관리자 인증 정보
     * @return 고아 파일 목록
     */
    @GetMapping("/s3/orphaned")
    public ResponseEntity<List<Map<String, Object>>> getOrphanedFiles(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(s3AdminService.findOrphanedFiles());
    }

    /**
     * S3 파일 일괄 삭제
     *
     * @param principal 관리자 인증 정보
     * @param body s3Keys 키로 삭제할 파일 키 목록 포함
     * @return 삭제된 파일 수
     */
    @DeleteMapping("/s3/files")
    public ResponseEntity<Map<String, Object>> deleteS3Files(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, List<String>> body) {
        checkAdmin(principal);
        int deleted = s3AdminService.deleteFiles(body.get("s3Keys"));
        return ResponseEntity.ok(Map.of("deletedCount", deleted));
    }

    /**
     * 고아 파일 일괄 정리 (세션 미연결 파일 자동 삭제)
     *
     * @param principal 관리자 인증 정보
     * @return 삭제된 파일 수
     */
    @PostMapping("/s3/cleanup")
    public ResponseEntity<Map<String, Object>> cleanupOrphaned(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        int deleted = s3AdminService.cleanupOrphaned();
        return ResponseEntity.ok(Map.of("deletedCount", deleted));
    }

    // ========== 세션 모니터링 ==========

    /**
     * 전체 세션 목록 조회 (모니터링용)
     *
     * @param principal 관리자 인증 정보
     * @return 전체 세션 목록 (프로젝트명, 담당자명 포함)
     */
    @GetMapping("/sessions")
    public ResponseEntity<List<Map<String, Object>>> getAllSessions(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getAllSessions());
    }

    /**
     * 세션 초기화 (관련 데이터 전체 삭제 후 세션 상태 리셋)
     *
     * @param principal 관리자 인증 정보
     * @param sessionId 초기화할 세션 ID
     * @return 200 OK
     */
    @PostMapping("/sessions/{sessionId}/reset")
    public ResponseEntity<Void> resetSession(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String sessionId) {
        checkAdmin(principal);
        adminService.resetSession(sessionId, principal.getId());
        return ResponseEntity.ok().build();
    }

    // ========== 대시보드 ==========

    /**
     * 관리자 대시보드 통계 조회
     *
     * @param principal 관리자 인증 정보
     * @return 전체 사용자 수, 승인 대기 수, 프로젝트 수, 세션 수
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getStats());
    }

    // ========== 감사 로그 ==========

    /**
     * 감사 로그 조회 (대상 유형 및 ID로 필터링 가능)
     *
     * @param principal 관리자 인증 정보
     * @param targetType 대상 유형 (USER, PROJECT, SESSION 등)
     * @param targetId 대상 ID
     * @return 감사 로그 목록 (최신순)
     */
    @GetMapping("/logs")
    public ResponseEntity<List<AuditLog>> getLogs(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) String targetId) {
        checkAdmin(principal);
        return ResponseEntity.ok(adminService.getLogs(targetType, targetId));
    }

    // ========== 사용자 활동 로그 (비관리자도 호출 가능) ==========

    /**
     * 사용자 활동 로그 기록 (비관리자도 호출 가능)
     *
     * @param principal 인증된 사용자 정보
     * @param body action, targetType, targetId, detail 포함
     * @return 200 OK
     */
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

    /**
     * Lambda 상태 강제 초기화 (관리자 전용)
     *
     * POST /api/admin/reset-lambda-status
     * is_lambda_running=false, current_upload_id=null 등으로 초기화
     */
    @PostMapping("/reset-lambda-status")
    public ResponseEntity<Map<String, Object>> resetLambdaStatus(
            @AuthenticationPrincipal UserPrincipal principal) {
        checkAdmin(principal);
        Map<String, Object> result = maintenanceService.resetLambdaStatus(principal.getId());
        return ResponseEntity.ok(result);
    }
}
