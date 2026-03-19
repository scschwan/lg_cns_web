package com.example.finance.service.admin;

import com.example.finance.enums.ProjectRole;
import com.example.finance.model.admin.AuditLog;
import com.example.finance.model.auth.User;
import com.example.finance.model.project.Project;
import com.example.finance.model.project.ProjectMember;
import com.example.finance.model.session.FileSession;
import com.example.finance.repository.admin.AuditLogRepository;
import com.example.finance.repository.auth.UserRepository;
import com.example.finance.repository.project.ProjectRepository;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.service.data.SessionDataService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 관리자 서비스
 *
 * 시스템 관리 기능의 비즈니스 로직을 담당한다.
 * 사용자 관리(승인/취소/삭제/일괄 처리), 프로젝트 관리(멤버 역할/추가/제거),
 * 세션 모니터링(초기화), 대시보드 통계, 감사 로그 기록/조회 기능을 포함한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final FileSessionRepository fileSessionRepository;
    private final AuditLogRepository auditLogRepository;
    private final SessionDataService sessionDataService;
    private final PasswordEncoder passwordEncoder;
    private final MongoTemplate mongoTemplate;

    // ========== 사용자 관리 ==========

    public List<Map<String, Object>> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::toUserMap)
                .collect(Collectors.toList());
    }

    public void approveUser(String userId, String adminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다"));
        user.setIsApproved(true);
        user.setIsActive(true);
        userRepository.save(user);
        writeLog(adminId, "APPROVE_USER", "USER", userId, user.getEmail() + " 승인");
    }

    public void revokeUser(String userId, String adminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다"));
        user.setIsApproved(false);
        userRepository.save(user);
        writeLog(adminId, "REVOKE_USER", "USER", userId, user.getEmail() + " 승인취소");
    }

    public void deleteUser(String userId, String adminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다"));
        String email = user.getEmail();
        userRepository.delete(user);
        writeLog(adminId, "DELETE_USER", "USER", userId, email + " 삭제");
    }

    public void bulkApprove(List<String> userIds, String adminId) {
        for (String uid : userIds) {
            try {
                approveUser(uid, adminId);
            } catch (Exception e) {
                log.warn("일괄 승인 실패: userId={}", uid, e);
            }
        }
    }

    public void bulkRevoke(List<String> userIds, String adminId) {
        for (String uid : userIds) {
            try {
                revokeUser(uid, adminId);
            } catch (Exception e) {
                log.warn("일괄 취소 실패: userId={}", uid, e);
            }
        }
    }

    // ========== 비밀번호 변경 ==========

    public void changePassword(String adminId, String currentPassword, String newPassword) {
        User admin = userRepository.findById(adminId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다"));
        if (!passwordEncoder.matches(currentPassword, admin.getPassword())) {
            throw new RuntimeException("현재 비밀번호가 일치하지 않습니다");
        }
        admin.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(admin);
        writeLog(adminId, "CHANGE_PASSWORD", "USER", adminId, "비밀번호 변경");
    }

    public void updateUserInfo(String userId, String name, String email, String adminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다"));
        if (name != null && !name.isBlank()) user.setName(name);
        if (email != null && !email.isBlank()) user.setEmail(email);
        userRepository.save(user);
        writeLog(adminId, "UPDATE_USER_INFO", "USER", userId, user.getEmail() + " 정보수정");
    }

    public void resetUserPassword(String userId, String newPassword, String adminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다"));
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        writeLog(adminId, "RESET_USER_PASSWORD", "USER", userId, user.getEmail() + " 비밀번호 초기화");
    }

    // ========== 프로젝트 관리 ==========

    public List<Map<String, Object>> getAllProjects() {
        List<Project> projects = projectRepository.findAll().stream()
                .filter(p -> !Boolean.TRUE.equals(p.getIsDeleted()))
                .collect(Collectors.toList());

        Map<String, String> userNameMap = buildUserNameMap();

        return projects.stream().map(p -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("projectId", p.getProjectId());
            map.put("projectName", p.getProjectName());
            map.put("description", p.getDescription());
            map.put("createdBy", p.getCreatedBy());
            map.put("ownerName", userNameMap.getOrDefault(p.getCreatedBy(), "-"));
            map.put("memberCount", p.getMembers() != null ? p.getMembers().size() : 0);
            map.put("totalSessions", p.getTotalSessions());
            map.put("createdAt", p.getCreatedAt());
            return map;
        }).collect(Collectors.toList());
    }

    public Map<String, Object> getProjectDetail(String projectId) {
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다"));

        Map<String, String> userNameMap = buildUserNameMap();
        Map<String, String> userEmailMap = buildUserEmailMap();

        List<Map<String, Object>> members = new ArrayList<>();
        if (project.getMembers() != null) {
            for (ProjectMember m : project.getMembers()) {
                Map<String, Object> mm = new LinkedHashMap<>();
                mm.put("userId", m.getUserId());
                mm.put("name", userNameMap.getOrDefault(m.getUserId(), "-"));
                mm.put("email", userEmailMap.getOrDefault(m.getUserId(), "-"));
                mm.put("role", m.getRole() != null ? m.getRole().name() : "VIEWER");
                mm.put("joinedAt", m.getJoinedAt());
                members.add(mm);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("projectId", project.getProjectId());
        result.put("projectName", project.getProjectName());
        result.put("description", project.getDescription());
        result.put("members", members);
        result.put("createdAt", project.getCreatedAt());
        return result;
    }

    public void updateMemberRole(String projectId, String targetUserId, String role, String adminId) {
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다"));

        ProjectRole newRole = ProjectRole.valueOf(role);

        // 소유자(OWNER)는 프로젝트당 1명만 허용 — 새 소유자 지정 시 기존 소유자를 편집자(EDITOR)로 자동 변경
        if (newRole == ProjectRole.OWNER) {
            for (ProjectMember m : project.getMembers()) {
                if (m.getRole() == ProjectRole.OWNER && !m.getUserId().equals(targetUserId)) {
                    m.setRole(ProjectRole.EDITOR);
                    writeLog(adminId, "CHANGE_ROLE", "PROJECT", projectId,
                            "기존 소유자 " + m.getUserId() + " → EDITOR (자동 변경)");
                }
            }
        }

        boolean found = false;
        for (ProjectMember m : project.getMembers()) {
            if (m.getUserId().equals(targetUserId)) {
                m.setRole(newRole);
                found = true;
                break;
            }
        }
        if (!found) {
            throw new RuntimeException("해당 멤버를 찾을 수 없습니다");
        }
        projectRepository.save(project);
        writeLog(adminId, "CHANGE_ROLE", "PROJECT", projectId,
                "멤버 " + targetUserId + " 역할 → " + role);
    }

    public void addProjectMember(String projectId, String targetUserId, String role, String adminId) {
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다"));

        boolean exists = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(targetUserId));
        if (exists) {
            throw new RuntimeException("이미 프로젝트에 소속된 멤버입니다");
        }

        ProjectRole newRole = ProjectRole.valueOf(role);
        // 소유자(OWNER)로 추가 시 기존 소유자를 편집자(EDITOR)로 자동 변경
        if (newRole == ProjectRole.OWNER) {
            for (ProjectMember m : project.getMembers()) {
                if (m.getRole() == ProjectRole.OWNER) {
                    m.setRole(ProjectRole.EDITOR);
                    writeLog(adminId, "CHANGE_ROLE", "PROJECT", projectId,
                            "기존 소유자 " + m.getUserId() + " → EDITOR (자동 변경)");
                }
            }
        }

        ProjectMember member = ProjectMember.builder()
                .userId(targetUserId)
                .role(newRole)
                .invitedBy(adminId)
                .joinedAt(LocalDateTime.now())
                .build();
        project.getMembers().add(member);
        projectRepository.save(project);
        writeLog(adminId, "ADD_MEMBER", "PROJECT", projectId,
                "멤버 " + targetUserId + " 추가 (" + role + ")");
    }

    public void removeProjectMember(String projectId, String targetUserId, String adminId) {
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다"));

        project.getMembers().removeIf(m -> m.getUserId().equals(targetUserId));
        projectRepository.save(project);
        writeLog(adminId, "REMOVE_MEMBER", "PROJECT", projectId,
                "멤버 " + targetUserId + " 제거");
    }

    // ========== 세션 모니터링 ==========

    public List<Map<String, Object>> getAllSessions() {
        List<FileSession> sessions = fileSessionRepository.findAll().stream()
                .filter(s -> s.getSessionName() != null && !s.getSessionName().trim().isEmpty())
                .filter(s -> !Boolean.TRUE.equals(s.getIsDeleted()))
                .collect(Collectors.toList());

        // 프로젝트 정보 캐시 (projectId → Project)
        Map<String, Project> projectCache = new HashMap<>();
        // 사용자 정보 캐시 (userId → User)
        Map<String, User> userCache = new HashMap<>();

        return sessions.stream().map(s -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("sessionId", s.getSessionId());
            map.put("sessionName", s.getSessionName());
            map.put("projectId", s.getProjectId());

            // 프로젝트명 조회
            String projectName = "";
            String managerName = "";
            if (s.getProjectId() != null) {
                Project project = projectCache.computeIfAbsent(s.getProjectId(), pid ->
                        projectRepository.findByProjectId(pid).orElse(null));
                if (project != null) {
                    projectName = project.getProjectName() != null ? project.getProjectName() : "";
                    // 담당자: 프로젝트 생성자
                    if (project.getCreatedBy() != null) {
                        User creator = userCache.computeIfAbsent(project.getCreatedBy(), uid ->
                                userRepository.findById(uid).orElse(null));
                        if (creator != null) {
                            managerName = creator.getName() != null ? creator.getName() : creator.getEmail();
                        }
                    }
                }
            }
            map.put("projectName", projectName);
            map.put("managerName", managerName);

            map.put("currentStep", s.getCurrentStep());
            map.put("progressPercentage", s.getProgressPercentage());
            map.put("isCompleted", s.getIsCompleted());
            map.put("totalRowCount", s.getTotalRowCount());
            map.put("createdAt", s.getCreatedAt());
            map.put("updatedAt", s.getUpdatedAt());
            return map;
        }).collect(Collectors.toList());
    }

    public void resetSession(String sessionId, String adminId) {
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        Query query = new Query(Criteria.where("session_id").is(sessionId));

        // session_data, column_mapping, process_data 삭제 (SessionDataService 사용)
        sessionDataService.deleteSessionData(sessionId);
        sessionDataService.deleteColumnMappings(sessionId);
        sessionDataService.deleteProcessData(sessionId);

        // clustering_results 삭제
        mongoTemplate.remove(query, "clustering_results");
        log.info("admin resetSession - clustering_results 삭제 완료: sessionId={}", sessionId);

        // preprocessing_config 삭제
        mongoTemplate.remove(query, "preprocessing_config");
        log.info("admin resetSession - preprocessing_config 삭제 완료: sessionId={}", sessionId);

        // process_view_data 삭제
        mongoTemplate.remove(query, "process_view_data");
        log.info("admin resetSession - process_view_data 삭제 완료: sessionId={}", sessionId);

        // search_keyword_hierarchy 삭제
        try {
            mongoTemplate.remove(query, "search_keyword_hierarchy");
            log.info("admin resetSession - search_keyword_hierarchy 삭제 완료: sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("admin resetSession - search_keyword_hierarchy 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // upload_sessions 삭제
        try {
            mongoTemplate.remove(query, "upload_sessions");
            log.info("admin resetSession - upload_sessions 삭제 완료: sessionId={}", sessionId);
        } catch (Exception e) {
            log.warn("admin resetSession - upload_sessions 삭제 실패 (계속 진행): sessionId={}", sessionId, e);
        }

        // FileSession 상태 초기화
        session.setIsCompleted(false);
        session.setCompletedAt(null);
        session.setCurrentStep(null);
        session.setProgressPercentage(0);
        session.setExportPath(null);
        if (session.getStepHistory() != null) {
            session.getStepHistory().clear();
        }
        session.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(session);

        log.info("admin resetSession - 세션 초기화 완료: sessionId={}", sessionId);

        writeLog(adminId, "RESET_SESSION", "SESSION", sessionId,
                session.getSessionName() + " 초기화");
    }

    // ========== 대시보드 통계 ==========

    public Map<String, Object> getStats() {
        List<User> allUsers = userRepository.findAll();
        long totalUsers = allUsers.size();
        long pendingUsers = allUsers.stream().filter(u -> !Boolean.TRUE.equals(u.getIsApproved())).count();
        long totalProjects = projectRepository.findAll().stream()
                .filter(p -> !Boolean.TRUE.equals(p.getIsDeleted())).count();
        long totalSessions = fileSessionRepository.findAll().stream()
                .filter(s -> s.getSessionName() != null && !s.getSessionName().trim().isEmpty())
                .filter(s -> !Boolean.TRUE.equals(s.getIsDeleted())).count();

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalUsers", totalUsers);
        stats.put("pendingUsers", pendingUsers);
        stats.put("totalProjects", totalProjects);
        stats.put("totalSessions", totalSessions);
        return stats;
    }

    // ========== 감사 로그 ==========

    public List<AuditLog> getLogs(String targetType, String targetId) {
        Sort sort = Sort.by(Sort.Direction.DESC, "createdAt");
        if (targetType != null && targetId != null) {
            return auditLogRepository.findByTargetTypeAndTargetId(targetType, targetId, sort);
        }
        if (targetType != null) {
            return auditLogRepository.findByTargetType(targetType, sort);
        }
        return auditLogRepository.findAll(sort);
    }

    public void logUserActivity(String userId, String action, String targetType, String targetId, String detail) {
        String userName = userRepository.findById(userId)
                .map(u -> u.getName() != null ? u.getName() : u.getEmail())
                .orElse("-");
        AuditLog auditLog = AuditLog.builder()
                .userId(userId)
                .userName(userName)
                .action(action != null ? action : "UNKNOWN")
                .targetType(targetType)
                .targetId(targetId)
                .detail(detail)
                .createdAt(LocalDateTime.now())
                .build();
        auditLogRepository.save(auditLog);
    }

    // ========== 내부 헬퍼 ==========

    private void writeLog(String adminId, String action, String targetType, String targetId, String detail) {
        AuditLog log = AuditLog.builder()
                .adminId(adminId)
                .action(action)
                .targetType(targetType)
                .targetId(targetId)
                .detail(detail)
                .createdAt(LocalDateTime.now())
                .build();
        auditLogRepository.save(log);
    }

    private Map<String, Object> toUserMap(User user) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", user.getId());
        map.put("email", user.getEmail());
        map.put("name", user.getName());
        map.put("role", user.getRole());
        map.put("isApproved", user.getIsApproved());
        map.put("isActive", user.getIsActive());
        map.put("createdAt", user.getCreatedAt());
        map.put("lastLoginAt", user.getLastLoginAt());
        return map;
    }

    private Map<String, String> buildUserNameMap() {
        return userRepository.findAll().stream()
                .collect(Collectors.toMap(User::getId, u -> u.getName() != null ? u.getName() : "-",
                        (a, b) -> a));
    }

    private Map<String, String> buildUserEmailMap() {
        return userRepository.findAll().stream()
                .collect(Collectors.toMap(User::getId, u -> u.getEmail() != null ? u.getEmail() : "-",
                        (a, b) -> a));
    }
}
