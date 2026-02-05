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

@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/sessions/{sessionId}/clustering")
@RequiredArgsConstructor
public class ClusteringController {

    private final ClusteringService clusteringService;
    private final ProjectService projectService;

    @PostMapping("/generate")
    public ResponseEntity<Map<String, Object>> generateClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody(required = false) Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());

        boolean includeSupplier = false;
        boolean includeCostCenter = false;
        if (body != null) {
            includeSupplier = Boolean.TRUE.equals(body.get("includeSupplier"));
            includeCostCenter = Boolean.TRUE.equals(body.get("includeCostCenter"));
        }

        return ResponseEntity.ok(
                clusteringService.generateUnmergedClusters(sessionId, includeSupplier, includeCostCenter));
    }

    @GetMapping("/unmerged")
    public ResponseEntity<Map<String, Object>> getUnmergedClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getUnmergedClusters(sessionId, page, size, keyword));
    }

    @GetMapping("/unmerged-ids")
    public ResponseEntity<List<Integer>> getAllUnmergedClusterNumbers(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam(required = false) String keyword,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getAllUnmergedClusterNumbers(sessionId, keyword));
    }

    @GetMapping("/keyword-stats")
    public ResponseEntity<List<Map<String, Object>>> getKeywordStats(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getKeywordStats(sessionId));
    }

    @GetMapping("/supplier-stats")
    public ResponseEntity<List<Map<String, Object>>> getSupplierStats(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getSupplierStats(sessionId));
    }

    @GetMapping("/merged")
    public ResponseEntity<List<Map<String, Object>>> getMergedClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getMergedClusters(sessionId));
    }

    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> getStatistics(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getStatistics(sessionId));
    }

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

    @PostMapping("/unmerge-partial")
    public ResponseEntity<Map<String, Object>> unmergePartialClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        Integer mergedClusterNumber = (Integer) body.get("mergedClusterNumber");
        @SuppressWarnings("unchecked")
        List<Integer> childClusterNumbers = (List<Integer>) body.get("childClusterNumbers");
        return ResponseEntity.ok(
                clusteringService.unmergePartialClusters(sessionId, mergedClusterNumber, childClusterNumbers));
    }

    @PostMapping("/merge-merged")
    public ResponseEntity<Map<String, Object>> mergeMergedClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        @SuppressWarnings("unchecked")
        List<Integer> mergedClusterNumbers = (List<Integer>) body.get("mergedClusterNumbers");
        return ResponseEntity.ok(clusteringService.mergeMergedClusters(sessionId, mergedClusterNumbers));
    }

    @PostMapping("/add-to-merged")
    public ResponseEntity<Map<String, Object>> addToMergedCluster(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        Integer targetMergedClusterNumber = (Integer) body.get("targetMergedClusterNumber");
        @SuppressWarnings("unchecked")
        List<Integer> clusterNumbers = (List<Integer>) body.get("clusterNumbers");
        return ResponseEntity.ok(
                clusteringService.addToMergedCluster(sessionId, targetMergedClusterNumber, clusterNumbers));
    }

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
        return ResponseEntity.ok(Map.of("success", true));
    }
}
