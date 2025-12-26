package com.example.finance.controller.project;

import com.example.finance.dto.request.project.CreateProjectRequest;
import com.example.finance.dto.request.project.InviteMemberRequest;
import com.example.finance.dto.response.project.ProjectSummary;
import com.example.finance.enums.ProjectRole;
import com.example.finance.model.project.Project;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.project.ProjectService;
import com.example.finance.service.upload.UploadService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 프로젝트 컨트롤러 (v2.0)
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Slf4j
@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;
    private final UploadService uploadService;



    /**
     * 프로젝트 생성
     */
    @PostMapping
    public ResponseEntity<Project> createProject(
            @CurrentUser UserPrincipal userPrincipal,
            @Valid @RequestBody CreateProjectRequest request) {

        log.info("프로젝트 생성 요청: userId={}, name={}",
                userPrincipal.getId(), request.getName());

        Project project = projectService.createProject(userPrincipal.getId(), request);

        return ResponseEntity.ok(project);
    }

    /**
     * 내 프로젝트 목록 조회
     */
    @GetMapping
    public ResponseEntity<List<ProjectSummary>> getUserProjects(
            @CurrentUser UserPrincipal userPrincipal) {

        log.info("프로젝트 목록 조회: userId={}", userPrincipal.getId());

        List<ProjectSummary> projects = projectService.getUserProjects(userPrincipal.getId());

        return ResponseEntity.ok(projects);
    }

    /**
     * 프로젝트 상세 조회
     */
    @GetMapping("/{projectId}")
    public ResponseEntity<Project> getProject(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String projectId) {

        log.info("프로젝트 조회: projectId={}", projectId);

        Project project = projectService.getProject(projectId, userPrincipal.getId());

        return ResponseEntity.ok(project);
    }

    /**
     * 프로젝트 정보 수정
     */
    @PutMapping("/{projectId}")
    public ResponseEntity<Project> updateProject(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String projectId,
            @Valid @RequestBody CreateProjectRequest request) {

        log.info("프로젝트 수정: projectId={}", projectId);

        Project project = projectService.updateProject(
                projectId, userPrincipal.getId(), request);

        return ResponseEntity.ok(project);
    }

    /**
     * 프로젝트 삭제
     */
    @DeleteMapping("/{projectId}")
    public ResponseEntity<Void> deleteProject(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String projectId) {

        log.info("프로젝트 삭제: projectId={}", projectId);

        projectService.deleteProject(projectId, userPrincipal.getId());

        return ResponseEntity.noContent().build();
    }

    /**
     * 멤버 초대
     */
    @PostMapping("/{projectId}/members")
    public ResponseEntity<Project> inviteMember(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String projectId,
            @Valid @RequestBody InviteMemberRequest request) {

        log.info("멤버 초대: projectId={}, email={}", projectId, request.getEmail());

        Project project = projectService.inviteMember(
                projectId, userPrincipal.getId(), request);

        return ResponseEntity.ok(project);
    }

    /**
     * 멤버 권한 변경
     */
    @PutMapping("/{projectId}/members/{userId}")
    public ResponseEntity<Project> updateMemberRole(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String projectId,
            @PathVariable String userId,
            @RequestParam ProjectRole role) {

        log.info("멤버 권한 변경: projectId={}, targetUserId={}, newRole={}",
                projectId, userId, role);

        Project project = projectService.updateMemberRole(
                projectId, userPrincipal.getId(), userId, role);

        return ResponseEntity.ok(project);
    }

    /**
     * 멤버 삭제
     */
    @DeleteMapping("/{projectId}/members/{userId}")
    public ResponseEntity<Project> removeMember(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String projectId,
            @PathVariable String userId) {

        log.info("멤버 삭제: projectId={}, targetUserId={}", projectId, userId);

        Project project = projectService.removeMember(
                projectId, userPrincipal.getId(), userId);

        return ResponseEntity.ok(project);
    }


    /**
     * 프로젝트에 업로드된 파일 목록 조회
     * GET /api/projects/{projectId}/files
     */
    @GetMapping("/{projectId}/files")
    public ResponseEntity<List<UploadedFileInfo>> getProjectFiles(
            @CurrentUser UserPrincipal userPrincipal,
            @PathVariable String projectId) {

        log.info("프로젝트 파일 목록 조회: projectId={}, userId={}",
                projectId, userPrincipal.getId());

        // 1. 프로젝트 권한 검증 (읽기 권한)
        projectService.getProject(projectId, userPrincipal.getId());

        // 2. 파일 목록 조회 (UploadService에 이미 구현됨!)
        List<UploadedFileInfo> files = uploadService.getProjectFiles(projectId);

        log.info("프로젝트 파일 조회 완료: {} files", files.size());

        return ResponseEntity.ok(files);
    }
}