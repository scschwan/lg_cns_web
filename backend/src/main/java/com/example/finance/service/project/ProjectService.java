package com.example.finance.service.project;

import com.example.finance.dto.response.project.ProjectSummary;
import com.example.finance.enums.ProjectRole;
import com.example.finance.exception.BusinessException;
import com.example.finance.exception.ProjectNotFoundException;
import com.example.finance.exception.UserNotFoundException;
import com.example.finance.model.project.Project;
import com.example.finance.model.project.ProjectMember;
import com.example.finance.model.auth.User;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.repository.project.ProjectRepository;
import com.example.finance.repository.auth.UserRepository;
import com.example.finance.repository.upload.UploadSessionRepository;
import com.example.finance.service.upload.FileSessionService;
import com.example.finance.service.common.S3Service;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import com.example.finance.dto.response.project.ProjectDetailResponse; // 추가
import com.example.finance.dto.response.project.ProjectMemberResponse; // 추가

/**
 * 프로젝트 서비스 (v2.0 - members 임베디드)
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final FileSessionRepository fileSessionRepository;
    private final com.example.finance.repository.data.SessionDataRepository sessionDataRepository;
    private final UploadSessionRepository uploadSessionRepository;
    private final FileSessionService fileSessionService;
    private final S3Service s3Service;

    /**
     * 프로젝트 생성
     *
     * @param userId 사용자 ID
     * @param request 프로젝트 생성 요청
     * @return 생성된 프로젝트
     */
    @Transactional
    public Project createProject(String userId, com.example.finance.dto.request.project.@Valid CreateProjectRequest request) {
        log.info("프로젝트 생성: userId={}, name={}", userId, request.getName());

        // 1. Owner 멤버 생성
        ProjectMember owner = ProjectMember.builder()
                .userId(userId)
                .role(ProjectRole.OWNER)
                .joinedAt(LocalDateTime.now())
                .invitedBy(userId)
                .build();

        // 2. 프로젝트 생성 (members 임베디드)
        Project project = Project.builder()
                .projectId(UUID.randomUUID().toString())
                .projectName(request.getName())
                .description(request.getDescription())
                .createdBy(userId)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .members(new ArrayList<>(Collections.singletonList(owner)))
                .totalSessions(0)
                .completedSessions(0)
                .totalFiles(0)
                .isDeleted(false)
                .build();

        project = projectRepository.save(project);

        log.info("프로젝트 생성 완료: projectId={}", project.getProjectId());

        return project;
    }

    /**
     * [수정] 멤버 초대
     * - 개선: 이메일 공백 제거 (trim) 적용
     * - 개선: 명확한 예외 처리 (BusinessException)
     */
    @Transactional
    public Project inviteMember(String projectId, String invitedBy,
                                com.example.finance.dto.request.project.@Valid InviteMemberRequest request) {
        // ⭐ 1. 이메일 공백 제거 (핵심 수정)
        String targetEmail = request.getEmail().trim();

        log.info("멤버 초대: projectId={}, email={}, role={}",
                projectId, targetEmail, request.getRole());

        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // 2. 권한 확인
        boolean isOwner = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(invitedBy) && m.getRole() == ProjectRole.OWNER);

        if (!isOwner) {
            // ⭐ 403 원인 파악을 위해 명확한 예외 던지기 (GlobalExceptionHandler에서 400/403 처리)
            throw new BusinessException("FORBIDDEN", "멤버를 초대할 권한이 없습니다 (OWNER만 가능)");
        }

        // ⭐ 3. 공백 제거된 이메일로 조회
        User user = userRepository.findByEmail(targetEmail)
                .orElseThrow(() -> new UserNotFoundException("사용자를 찾을 수 없습니다: " + targetEmail));

        // 4. 중복 확인
        boolean alreadyMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(user.getId()));

        if (alreadyMember) {
            throw new BusinessException("ALREADY_EXISTS", "이미 프로젝트 멤버입니다");
        }

        // 5. 멤버 추가
        ProjectMember newMember = ProjectMember.builder()
                .userId(user.getId())
                .role(request.getRole())
                .invitedBy(invitedBy)
                .joinedAt(LocalDateTime.now())
                .build();

        project.getMembers().add(newMember);
        project.setUpdatedAt(LocalDateTime.now());

        return projectRepository.save(project);
    }

    /**
     * 멤버 권한 변경
     *
     * @param projectId 프로젝트 ID
     * @param requestUserId 요청한 사용자 ID
     * @param targetUserId 대상 사용자 ID
     * @param newRole 새 권한
     * @return 업데이트된 프로젝트
     */
    @Transactional
    public Project updateMemberRole(String projectId, String requestUserId,
                                    String targetUserId, ProjectRole newRole) {
        log.info("멤버 권한 변경: projectId={}, targetUserId={}, newRole={}",
                projectId, targetUserId, newRole);

        // 1. 프로젝트 조회
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // 2. 권한 확인 (OWNER만 가능)
        boolean isOwner = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(requestUserId) && m.getRole() == ProjectRole.OWNER);

        if (!isOwner) {
            throw new RuntimeException("권한을 변경할 권한이 없습니다");
        }

        // 3. 멤버 찾아서 권한 변경
        ProjectMember targetMember = project.getMembers().stream()
                .filter(m -> m.getUserId().equals(targetUserId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("프로젝트 멤버가 아닙니다"));

        targetMember.setRole(newRole);
        project.setUpdatedAt(LocalDateTime.now());

        project = projectRepository.save(project);

        log.info("멤버 권한 변경 완료");

        return project;
    }

    /**
     * 멤버 삭제
     *
     * @param projectId 프로젝트 ID
     * @param requestUserId 요청한 사용자 ID
     * @param targetUserId 삭제할 사용자 ID
     * @return 업데이트된 프로젝트
     */
    @Transactional
    public Project removeMember(String projectId, String requestUserId, String targetUserId) {
        log.info("멤버 삭제: projectId={}, targetUserId={}", projectId, targetUserId);

        // 1. 프로젝트 조회
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // 2. 권한 확인 (OWNER만 가능)
        boolean isOwner = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(requestUserId) && m.getRole() == ProjectRole.OWNER);

        if (!isOwner) {
            throw new RuntimeException("멤버를 삭제할 권한이 없습니다");
        }

        // 3. OWNER는 삭제 불가
        ProjectMember targetMember = project.getMembers().stream()
                .filter(m -> m.getUserId().equals(targetUserId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("프로젝트 멤버가 아닙니다"));

        if (targetMember.getRole() == ProjectRole.OWNER) {
            throw new RuntimeException("소유자는 삭제할 수 없습니다");
        }

        // 4. 멤버 삭제
        project.getMembers().remove(targetMember);
        project.setUpdatedAt(LocalDateTime.now());

        project = projectRepository.save(project);

        log.info("멤버 삭제 완료");

        return project;
    }

    /**
     * 사용자가 속한 프로젝트 목록 조회
     *
     * @param userId 사용자 ID
     * @return 프로젝트 요약 목록
     */
    public List<ProjectSummary> getUserProjects(String userId) {
        log.info("사용자 프로젝트 목록 조회: userId={}", userId);

        // 1. members.user_id로 프로젝트 조회
        List<Project> projects = projectRepository.findByMembersUserIdAndIsDeletedFalse(userId);

        if (projects.isEmpty()) {
            return new ArrayList<>();
        }

        // 2. 요약 정보 생성
        return projects.stream()
                .map(project -> {
                    ProjectMember membership = project.getMembers().stream()
                            .filter(m -> m.getUserId().equals(userId))
                            .findFirst()
                            .orElseThrow();

                    // 세션 통계 조회
                    /*
                    long totalSessions = fileSessionRepository
                            .countByProjectIdAndIsDeletedFalse(project.getProjectId());
                    long completedSessions = fileSessionRepository
                            .countByProjectIdAndIsCompletedTrueAndIsDeletedFalse(project.getProjectId());
                    */
                    // sessionName이 있는(빈 문자열이 아닌) 세션만 카운트
                    long totalSessions = fileSessionRepository
                            .countActiveSessionsWithName(project.getProjectId());
                    long completedSessions = fileSessionRepository
                            .countCompletedSessionsWithName(project.getProjectId());


                    return ProjectSummary.builder()
                            .projectId(project.getProjectId())
                            .name(project.getProjectName())
                            .description(project.getDescription())
                            .role(membership.getRole())
                            .memberCount(project.getMembers().size())
                            .totalSessions((int) totalSessions)
                            .completedSessions((int) completedSessions)
                            .isCompleted(project.getIsCompleted())
                            .createdAt(project.getCreatedAt())
                            .lastAccessedAt(project.getUpdatedAt())
                            .build();
                })
                .collect(Collectors.toList());
    }

    /**
     * 프로젝트 상세 조회
     *
     * @param projectId 프로젝트 ID
     * @param userId 요청한 사용자 ID
     * @return 프로젝트
     */
    public Project getProject(String projectId, String userId) {
        log.info("프로젝트 조회: projectId={}, userId={}", projectId, userId);

        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // 멤버 확인
        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("프로젝트에 접근할 권한이 없습니다");
        }

        return project;
    }

    /**
     * [신규] 프로젝트 상세 조회 (User 정보 포함)
     * - 기존 getProject 대신 이 메서드를 사용하여 화면에 이름/이메일 표시
     */
    public ProjectDetailResponse getProjectDetail(String projectId, String userId) {
        log.info("프로젝트 상세 조회: projectId={}, userId={}", projectId, userId);

        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // 멤버 확인
        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new BusinessException("FORBIDDEN", "프로젝트에 접근할 권한이 없습니다");
        }

        // ⭐ 1. 모든 멤버의 User ID 추출
        List<String> memberUserIds = project.getMembers().stream()
                .map(ProjectMember::getUserId)
                .collect(Collectors.toList());

        // ⭐ 2. UserRepository에서 사용자 정보 일괄 조회 (최적화)
        List<User> users = userRepository.findAllById(memberUserIds);

        // ⭐ 3. 매핑을 위해 Map으로 변환
        Map<String, User> userMap = users.stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        // ⭐ 4. DTO 변환 (ProjectMember + User Info)
        List<ProjectMemberResponse> memberResponses = project.getMembers().stream()
                .map(member -> {
                    User user = userMap.get(member.getUserId());
                    return ProjectMemberResponse.builder()
                            .userId(member.getUserId())
                            .email(user != null ? user.getEmail() : "Unknown User") // 정보 매핑
                            .name(user != null ? user.getName() : "알 수 없음")       // 정보 매핑
                            .role(member.getRole())
                            .joinedAt(member.getJoinedAt())
                            .build();
                })
                .collect(Collectors.toList());

        // ⭐ 5. 현재 사용자 역할 조회
        String myRole = project.getMembers().stream()
                .filter(m -> m.getUserId().equals(userId))
                .findFirst()
                .map(m -> m.getRole() != null ? m.getRole().name() : "VIEWER")
                .orElse("VIEWER");

        // ⭐ 6. 최종 응답 생성
        return ProjectDetailResponse.builder()
                .projectId(project.getProjectId())
                .projectName(project.getProjectName())
                .description(project.getDescription())
                .members(memberResponses)
                .createdBy(project.getCreatedBy())
                .myRole(myRole)
                .isCompleted(project.getIsCompleted())
                .createdAt(project.getCreatedAt())
                .updatedAt(project.getUpdatedAt())
                .build();
    }


    /**
     * 프로젝트 정보 수정
     *
     * @param projectId 프로젝트 ID
     * @param userId 요청한 사용자 ID
     * @param request 수정 요청
     * @return 업데이트된 프로젝트
     */
    @Transactional
    public Project updateProject(String projectId, String userId, com.example.finance.dto.request.project.@Valid CreateProjectRequest request) {
        log.info("프로젝트 수정: projectId={}", projectId);

        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // OWNER 권한 확인
        boolean isOwner = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId) && m.getRole() == ProjectRole.OWNER);

        if (!isOwner) {
            throw new RuntimeException("프로젝트를 수정할 권한이 없습니다");
        }

        project.setProjectName(request.getName());
        project.setDescription(request.getDescription());
        project.setUpdatedAt(LocalDateTime.now());

        return projectRepository.save(project);
    }

    /**
     * 프로젝트 삭제 (소프트 삭제 + 전체 cascade)
     * 프로젝트 내 모든 세션, 파일, 관련 데이터를 일괄 삭제
     *
     * @param projectId 프로젝트 ID
     * @param userId 요청한 사용자 ID
     */
    @Transactional
    public void deleteProject(String projectId, String userId) {
        log.info("프로젝트 삭제 시작: projectId={}", projectId);

        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // OWNER 권한 확인
        boolean isOwner = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId) && m.getRole() == ProjectRole.OWNER);

        if (!isOwner) {
            throw new RuntimeException("프로젝트를 삭제할 권한이 없습니다");
        }

        // ★ 프로젝트 내 모든 세션에 대해 cascade 삭제 수행
        List<com.example.finance.model.session.FileSession> allSessions =
                fileSessionRepository.findByProjectId(projectId);

        log.info("프로젝트 내 세션 {}개 cascade 삭제 시작", allSessions.size());

        for (com.example.finance.model.session.FileSession session : allSessions) {
            try {
                // 세션 관련 모든 컬렉션 데이터 삭제
                fileSessionService.cascadeDeleteSessionData(session.getSessionId(), projectId);
                // FileSession 문서 삭제
                fileSessionRepository.delete(session);
                log.info("세션 삭제 완료: sessionId={}", session.getSessionId());
            } catch (Exception e) {
                log.error("세션 삭제 실패 (계속 진행): sessionId={}", session.getSessionId(), e);
            }
        }

        // ★ 프로젝트 단위 upload_sessions 삭제 (혹시 남아있는 것)
        try {
            uploadSessionRepository.deleteByProjectId(projectId);
            log.info("프로젝트 upload_sessions 일괄 삭제 완료");
        } catch (Exception e) {
            log.warn("프로젝트 upload_sessions 일괄 삭제 실패 (계속 진행)", e);
        }

        // ★ S3 프로젝트 폴더 전체 삭제
        try {
            String s3Prefix = String.format("projects/%s/", projectId);
            s3Service.deleteFolder(s3Prefix);
            log.info("S3 프로젝트 폴더 삭제 완료: prefix={}", s3Prefix);
        } catch (Exception e) {
            log.warn("S3 프로젝트 폴더 삭제 실패 (계속 진행)", e);
        }

        // 소프트 삭제
        project.setIsDeleted(true);
        project.setDeletedAt(LocalDateTime.now());
        project.setDeletedBy(userId);

        projectRepository.save(project);

        log.info("프로젝트 삭제 완료: projectId={}, 삭제된 세션 {}개", projectId, allSessions.size());
    }

    /**
     * 프로젝트 완료 처리
     * - 미완료 세션의 모든 관련 데이터 cascade 삭제 + 세션 삭제
     * - 프로젝트 is_completed = true
     */
    @Transactional
    public Map<String, Object> completeProject(String projectId, String userId) {
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        var allSessions = fileSessionRepository.findByProjectId(projectId);
        int deletedCount = 0;

        for (var session : allSessions) {
            if (!Boolean.TRUE.equals(session.getIsCompleted())) {
                // ★ 미완료 세션: 전체 cascade 삭제
                try {
                    fileSessionService.cascadeDeleteSessionData(session.getSessionId(), projectId);
                    fileSessionRepository.delete(session);
                    deletedCount++;
                    log.info("미완료 세션 cascade 삭제 완료: sessionId={}", session.getSessionId());
                } catch (Exception e) {
                    log.error("미완료 세션 삭제 실패 (계속 진행): sessionId={}", session.getSessionId(), e);
                }
            }
        }

        project.setIsCompleted(true);
        project.setUpdatedAt(LocalDateTime.now());
        projectRepository.save(project);

        log.info("프로젝트 완료 처리: projectId={}, 삭제된 미완료 세션 {}건", projectId, deletedCount);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("projectId", projectId);
        result.put("isCompleted", true);
        result.put("deletedSessions", deletedCount);
        return result;
    }

    /**
     * 프로젝트 내 모든 세션 완료 여부 확인 후 자동 갱신
     */
    public void checkAndUpdateProjectCompletion(String projectId) {
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
    }
}