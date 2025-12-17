package com.example.finance.service;

import com.example.finance.dto.request.CreateProjectRequest;
import com.example.finance.dto.request.InviteMemberRequest;
import com.example.finance.dto.response.ProjectSummary;
import com.example.finance.enums.ProjectRole;
import com.example.finance.exception.AlreadyMemberException;
import com.example.finance.exception.ProjectNotFoundException;
import com.example.finance.exception.UserNotFoundException;
import com.example.finance.model.Project;
import com.example.finance.model.ProjectMember;
import com.example.finance.model.User;
import com.example.finance.repository.ProjectMemberRepository;
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
 * 프로젝트 서비스
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final UserRepository userRepository;

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

        // 1. 프로젝트 생성
        Project project = Project.builder()
                .projectId(UUID.randomUUID().toString())
                .name(request.getName())
                .description(request.getDescription())
                .ownerId(userId)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .isActive(true)
                .settings(new HashMap<>())
                .build();

        project = projectRepository.save(project);

        // 2. Owner 멤버 추가
        Map<String, Boolean> ownerPermissions = new HashMap<>();
        ownerPermissions.put("can_upload", true);
        ownerPermissions.put("can_edit", true);
        ownerPermissions.put("can_delete", true);
        ownerPermissions.put("can_share", true);

        ProjectMember owner = ProjectMember.builder()
                .projectId(project.getProjectId())
                .userId(userId)
                .role(ProjectRole.OWNER)
                .joinedAt(LocalDateTime.now())
                .permissions(ownerPermissions)
                .build();

        projectMemberRepository.save(owner);

        log.info("프로젝트 생성 완료: projectId={}", project.getProjectId());

        return project;
    }

    /**
     * 멤버 초대
     *
     * @param projectId 프로젝트 ID
     * @param invitedBy 초대한 사용자 ID
     * @param request 멤버 초대 요청
     * @return 추가된 멤버
     */
    @Transactional
    public ProjectMember inviteMember(String projectId, String invitedBy,
                                      InviteMemberRequest request) {
        log.info("멤버 초대: projectId={}, email={}, role={}",
                projectId, request.getEmail(), request.getRole());

        // 1. 권한 확인 (OWNER만 가능)
        ProjectMember inviter = projectMemberRepository
                .findByProjectIdAndUserId(projectId, invitedBy)
                .orElseThrow(() -> new RuntimeException("프로젝트 멤버가 아닙니다"));

        if (inviter.getRole() != ProjectRole.OWNER) {
            throw new RuntimeException("멤버를 초대할 권한이 없습니다");
        }

        // 2. 사용자 조회
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new UserNotFoundException("사용자를 찾을 수 없습니다: " + request.getEmail()));

        // 3. 이미 멤버인지 확인
        if (projectMemberRepository.existsByProjectIdAndUserId(projectId, user.getId())) {
            throw new AlreadyMemberException("이미 프로젝트 멤버입니다");
        }

        // 4. 멤버 추가
        Map<String, Boolean> permissions = getPermissionsByRole(request.getRole());

        ProjectMember member = ProjectMember.builder()
                .projectId(projectId)
                .userId(user.getId())
                .role(request.getRole())
                .invitedBy(invitedBy)
                .joinedAt(LocalDateTime.now())
                .permissions(permissions)
                .build();

        member = projectMemberRepository.save(member);

        log.info("멤버 초대 완료: projectId={}, userId={}", projectId, user.getId());

        return member;
    }

    /**
     * 사용자가 속한 프로젝트 목록 조회
     *
     * @param userId 사용자 ID
     * @return 프로젝트 요약 목록
     */
    public List<ProjectSummary> getUserProjects(String userId) {
        log.info("사용자 프로젝트 목록 조회: userId={}", userId);

        // 1. 사용자가 속한 프로젝트 멤버십 조회
        List<ProjectMember> memberships = projectMemberRepository.findByUserId(userId);

        if (memberships.isEmpty()) {
            return new ArrayList<>();
        }

        // 2. 프로젝트 정보 조회
        List<String> projectIds = memberships.stream()
                .map(ProjectMember::getProjectId)
                .collect(Collectors.toList());

        List<Project> projects = projectRepository.findByProjectIdIn(projectIds);

        // 3. 요약 정보 생성
        return projects.stream()
                .map(project -> {
                    ProjectMember membership = memberships.stream()
                            .filter(m -> m.getProjectId().equals(project.getProjectId()))
                            .findFirst()
                            .orElseThrow();

                    int memberCount = projectMemberRepository
                            .countByProjectId(project.getProjectId());

                    return ProjectSummary.builder()
                            .projectId(project.getProjectId())
                            .name(project.getName())
                            .role(membership.getRole())
                            .memberCount(memberCount)
                            .lastAccessedAt(project.getUpdatedAt())
                            .build();
                })
                .collect(Collectors.toList());
    }

    /**
     * 프로젝트 조회
     *
     * @param projectId 프로젝트 ID
     * @return 프로젝트
     */
    public Project getProject(String projectId) {
        return projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다: " + projectId));
    }

    /**
     * 역할별 권한 설정
     */
    private Map<String, Boolean> getPermissionsByRole(ProjectRole role) {
        Map<String, Boolean> permissions = new HashMap<>();

        switch (role) {
            case OWNER:
                permissions.put("can_upload", true);
                permissions.put("can_edit", true);
                permissions.put("can_delete", true);
                permissions.put("can_share", true);
                break;
            case EDITOR:
                permissions.put("can_upload", true);
                permissions.put("can_edit", true);
                permissions.put("can_delete", false);
                permissions.put("can_share", false);
                break;
            case VIEWER:
                permissions.put("can_upload", false);
                permissions.put("can_edit", false);
                permissions.put("can_delete", false);
                permissions.put("can_share", false);
                break;
        }

        return permissions;
    }
}