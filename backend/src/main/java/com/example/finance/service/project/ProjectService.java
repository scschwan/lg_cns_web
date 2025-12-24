package com.example.finance.service;

import com.example.finance.dto.request.CreateProjectRequest;
import com.example.finance.dto.request.InviteMemberRequest;
import com.example.finance.dto.response.ProjectSummary;
import com.example.finance.enums.ProjectRole;
import com.example.finance.exception.ProjectNotFoundException;
import com.example.finance.exception.UserNotFoundException;
import com.example.finance.model.Project;
import com.example.finance.model.ProjectMember;
import com.example.finance.model.User;
import com.example.finance.repository.FileSessionRepository;
import com.example.finance.repository.ProjectRepository;
import com.example.finance.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

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

    /**
     * 프로젝트 생성
     *
     * @param userId 사용자 ID
     * @param request 프로젝트 생성 요청
     * @return 생성된 프로젝트
     */
    @Transactional
    public Project createProject(String userId, CreateProjectRequest request) {
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
                .members(Collections.singletonList(owner))
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
     * 멤버 초대
     *
     * @param projectId 프로젝트 ID
     * @param invitedBy 초대한 사용자 ID
     * @param request 멤버 초대 요청
     * @return 업데이트된 프로젝트
     */
    @Transactional
    public Project inviteMember(String projectId, String invitedBy,
                                InviteMemberRequest request) {
        log.info("멤버 초대: projectId={}, email={}, role={}",
                projectId, request.getEmail(), request.getRole());

        // 1. 프로젝트 조회
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // 2. 권한 확인 (OWNER만 가능)
        boolean isOwner = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(invitedBy) && m.getRole() == ProjectRole.OWNER);

        if (!isOwner) {
            throw new RuntimeException("멤버를 초대할 권한이 없습니다");
        }

        // 3. 사용자 조회
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new UserNotFoundException("사용자를 찾을 수 없습니다: " + request.getEmail()));

        // 4. 이미 멤버인지 확인
        boolean alreadyMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(user.getId()));

        if (alreadyMember) {
            throw new RuntimeException("이미 프로젝트 멤버입니다");
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

        project = projectRepository.save(project);

        log.info("멤버 초대 완료: projectId={}, userId={}", projectId, user.getId());

        return project;
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
                    long totalSessions = fileSessionRepository
                            .countByProjectIdAndIsDeletedFalse(project.getProjectId());
                    long completedSessions = fileSessionRepository
                            .countByProjectIdAndIsCompletedTrueAndIsDeletedFalse(project.getProjectId());

                    return ProjectSummary.builder()
                            .projectId(project.getProjectId())
                            .name(project.getProjectName())
                            .description(project.getDescription())
                            .role(membership.getRole())
                            .memberCount(project.getMembers().size())
                            .totalSessions((int) totalSessions)
                            .completedSessions((int) completedSessions)
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
     * 프로젝트 정보 수정
     *
     * @param projectId 프로젝트 ID
     * @param userId 요청한 사용자 ID
     * @param request 수정 요청
     * @return 업데이트된 프로젝트
     */
    @Transactional
    public Project updateProject(String projectId, String userId, CreateProjectRequest request) {
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
     * 프로젝트 삭제 (소프트 삭제)
     *
     * @param projectId 프로젝트 ID
     * @param userId 요청한 사용자 ID
     */
    @Transactional
    public void deleteProject(String projectId, String userId) {
        log.info("프로젝트 삭제: projectId={}", projectId);

        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // OWNER 권한 확인
        boolean isOwner = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId) && m.getRole() == ProjectRole.OWNER);

        if (!isOwner) {
            throw new RuntimeException("프로젝트를 삭제할 권한이 없습니다");
        }

        // 소프트 삭제
        project.setIsDeleted(true);
        project.setDeletedAt(LocalDateTime.now());
        project.setDeletedBy(userId);

        projectRepository.save(project);

        log.info("프로젝트 삭제 완료");
    }
}