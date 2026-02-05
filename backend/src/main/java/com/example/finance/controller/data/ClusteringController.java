package com.example.finance.controller.data;

import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.data.ClusteringService;
import com.example.finance.service.project.ProjectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 클러스터링 컨트롤러 (Step 5: Clustering)
 *
 * Base path: /api/projects/{projectId}/sessions/{sessionId}/clustering
 */
@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/sessions/{sessionId}/clustering")
@RequiredArgsConstructor
public class ClusteringController {

    private final ClusteringService clusteringService;
    private final ProjectService projectService;

    /**
     * 미병합 클러스터 생성 (process_view_data 기반)
     */
    @PostMapping("/generate")
    public ResponseEntity<Map<String, Object>> generateClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.generateUnmergedClusters(sessionId));
    }

    /**
     * 미병합 클러스터 목록 조회 (페이징)
     */
    @GetMapping("/unmerged")
    public ResponseEntity<Map<String, Object>> getUnmergedClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getUnmergedClusters(sessionId, page, size));
    }

    /**
     * 병합 클러스터 목록 조회
     */
    @GetMapping("/merged")
    public ResponseEntity<List<Map<String, Object>>> getMergedClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getMergedClusters(sessionId));
    }

    /**
     * 통계 조회
     */
    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> getStatistics(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getStatistics(sessionId));
    }

    /**
     * 클러스터 병합
     */
    @PostMapping("/merge")
    public ResponseEntity<Map<String, Object>> mergeClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());

        @SuppressWarnings("unchecked")
        List<Integer> clusterNumbers = (List<Integer>) body.get("clusterNumbers");

        return ResponseEntity.ok(clusteringService.mergeClusters(sessionId, clusterNumbers));
    }

    /**
     * 클러스터 병합 해제 (전체)
     */
    @PostMapping("/unmerge")
    public ResponseEntity<Map<String, Object>> unmergeClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());

        Integer mergedClusterNumber = (Integer) body.get("mergedClusterNumber");

        return ResponseEntity.ok(clusteringService.unmergeClusters(sessionId, mergedClusterNumber));
    }

    /**
     * 클러스터명 수정
     */
    @PutMapping("/rename")
    public ResponseEntity<Map<String, Object>> renameCluster(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());

        Integer clusterNumber = (Integer) body.get("clusterNumber");
        String newName = (String) body.get("newName");

        clusteringService.updateClusterName(sessionId, clusterNumber, newName);

        Map<String, Object> result = Map.of("success", true);
        return ResponseEntity.ok(result);
    }
}
