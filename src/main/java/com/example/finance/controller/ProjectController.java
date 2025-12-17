package com.example.finance.controller;

import com.example.finance.dto.request.CreateProjectRequest;
import com.example.finance.dto.request.InviteMemberRequest;
import com.example.finance.dto.response.ProjectSummary;
import com.example.finance.model.Project;
import com.example.finance.model.ProjectMember;
import com.example.finance.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 프로젝트 컨트롤러
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Slf4j
@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    /**
     * 프로젝트 생성
     *
     * POST /api/projects
     */
    @PostMapping
    public ResponseEntity<Project> createProject(
            @Valid @RequestBody CreateProjectRequest request,
            Authentication authentication) {

        String userId = authentication.getName();
        log.info("프로젝트 생성 요청: userId={}, name={}", userId, request.getName());

        Project project = projectService.createProject(userId, request);

        return ResponseEntity.status(HttpStatus.CREATED).body(project);
    }

    /**
     * 사용자 프로젝트 목록 조회
     *
     * GET /api/projects
     */
    @GetMapping
    public ResponseEntity<List<ProjectSummary>> getUserProjects(Authentication authentication) {
        String userId = authentication.getName();
        log.info("프로젝트 목록 조회: userId={}", userId);

        List<ProjectSummary> projects = projectService.getUserProjects(userId);

        return ResponseEntity.ok(projects);
    }

    /**
     * 프로젝트 조회
     *
     * GET /api/projects/{projectId}
     */
    @GetMapping("/{projectId}")
    public ResponseEntity<Project> getProject(@PathVariable String projectId) {
        log.info("프로젝트 조회: projectId={}", projectId);

        Project project = projectService.getProject(projectId);

        return ResponseEntity.ok(project);
    }

    /**
     * 멤버 초대
     *
     * POST /api/projects/{projectId}/members
     */
    @PostMapping("/{projectId}/members")
    public ResponseEntity<Map<String, Object>> inviteMember(
            @PathVariable String projectId,
            @Valid @RequestBody InviteMemberRequest request,
            Authentication authentication) {

        String userId = authentication.getName();
        log.info("멤버 초대 요청: projectId={}, email={}", projectId, request.getEmail());

        ProjectMember member = projectService.inviteMember(projectId, userId, request);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "멤버 초대가 완료되었습니다");
        response.put("member", member);

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}