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
            @RequestParam(required = false) String supplier,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getAllUnmergedClusterNumbers(sessionId, keyword, supplier));
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

    @GetMapping("/merged/{clusterNumber}/children")
    public ResponseEntity<Map<String, Object>> getMergedClusterChildren(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @PathVariable int clusterNumber,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getMergedClusterChildren(sessionId, clusterNumber, page, size));
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

        // ★ selectAll 필터 방식: POST body 크기를 줄이기 위해 백엔드에서 번호 해석
        if (Boolean.TRUE.equals(body.get("selectAll"))) {
            @SuppressWarnings("unchecked")
            List<Integer> exceptions = (List<Integer>) body.get("exceptions");
            String keyword = (String) body.get("keyword");
            String supplier = (String) body.get("supplier");
            return ResponseEntity.ok(
                    clusteringService.mergeClustersWithFilter(sessionId, exceptions, keyword, supplier));
        }

        @SuppressWarnings("unchecked")
        List<Integer> clusterNumbers = (List<Integer>) body.get("clusterNumbers");
        return ResponseEntity.ok(clusteringService.mergeClusters(sessionId, clusterNumbers));
    }

    @PostMapping("/merge/start")
    public ResponseEntity<Map<String, Object>> mergeStart(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.mergeStart(sessionId));
    }

    @PostMapping("/merge/batch")
    public ResponseEntity<Map<String, Object>> mergeBatch(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        Integer mergedClusterNumber = ((Number) body.get("mergedClusterNumber")).intValue();
        @SuppressWarnings("unchecked")
        List<Integer> clusterNumbers = (List<Integer>) body.get("clusterNumbers");
        return ResponseEntity.ok(clusteringService.mergeBatch(sessionId, mergedClusterNumber, clusterNumbers));
    }

    @PostMapping("/merge/finalize")
    public ResponseEntity<Map<String, Object>> mergeFinalize(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        Integer mergedClusterNumber = ((Number) body.get("mergedClusterNumber")).intValue();
        return ResponseEntity.ok(clusteringService.mergeFinalize(sessionId, mergedClusterNumber));
    }

    @GetMapping("/merge/progress/{taskId}")
    public ResponseEntity<Map<String, Object>> getMergeProgress(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @PathVariable String taskId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getMergeProgress(taskId));
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

    @PostMapping("/auto-merge-undefined")
    public ResponseEntity<Map<String, Object>> autoMergeUndefined(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.autoMergeUndefined(sessionId));
    }

    // ============================================================
    // 고급 검색 API
    // ============================================================

    @PostMapping("/advanced-search")
    public ResponseEntity<Map<String, Object>> advancedSearch(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());

        int page = body.get("page") != null ? ((Number) body.get("page")).intValue() : 0;
        int size = body.get("size") != null ? ((Number) body.get("size")).intValue() : 20;
        String searchColumn = (String) body.get("searchColumn");
        String searchValue = (String) body.get("searchValue");
        boolean exactMatch = Boolean.TRUE.equals(body.get("exactMatch"));
        String excludeValue = (String) body.get("excludeValue");
        boolean excludeExactMatch = Boolean.TRUE.equals(body.get("excludeExactMatch"));

        @SuppressWarnings("unchecked")
        List<Integer> withinClusterNumbers = (List<Integer>) body.get("withinClusterNumbers");

        return ResponseEntity.ok(clusteringService.advancedSearch(
                sessionId, page, size,
                searchColumn, searchValue, exactMatch,
                excludeValue, excludeExactMatch,
                withinClusterNumbers));
    }

    @PostMapping("/advanced-search-ids")
    public ResponseEntity<List<Integer>> getAdvancedSearchClusterNumbers(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());

        String searchColumn = (String) body.get("searchColumn");
        String searchValue = (String) body.get("searchValue");
        boolean exactMatch = Boolean.TRUE.equals(body.get("exactMatch"));
        String excludeValue = (String) body.get("excludeValue");
        boolean excludeExactMatch = Boolean.TRUE.equals(body.get("excludeExactMatch"));

        @SuppressWarnings("unchecked")
        List<Integer> withinClusterNumbers = (List<Integer>) body.get("withinClusterNumbers");

        return ResponseEntity.ok(clusteringService.getAdvancedSearchClusterNumbers(
                sessionId,
                searchColumn, searchValue, exactMatch,
                excludeValue, excludeExactMatch,
                withinClusterNumbers));
    }

    @GetMapping("/searchable-columns")
    public ResponseEntity<List<Map<String, String>>> getSearchableColumns(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getSearchableColumns(sessionId));
    }

    // ============================================================
    // 키워드 계층 API (Lv1/Lv2/Lv3)
    // ============================================================

    @GetMapping("/keyword-hierarchy")
    public ResponseEntity<List<Map<String, Object>>> getKeywordHierarchy(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.getKeywordHierarchy(sessionId));
    }

    @PostMapping("/keyword-hierarchy")
    public ResponseEntity<Map<String, Object>> addKeywordHierarchy(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());

        Integer level = ((Number) body.get("level")).intValue();
        String parentId = (String) body.get("parentId");
        String keyword = (String) body.get("keyword");

        return ResponseEntity.ok(clusteringService.addKeywordHierarchy(sessionId, level, parentId, keyword));
    }

    @PutMapping("/keyword-hierarchy/{id}")
    public ResponseEntity<Map<String, Object>> updateKeywordHierarchy(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @PathVariable String id,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        String keyword = (String) body.get("keyword");
        return ResponseEntity.ok(clusteringService.updateKeywordHierarchy(id, keyword));
    }

    @DeleteMapping("/keyword-hierarchy/{id}")
    public ResponseEntity<Map<String, Object>> deleteKeywordHierarchy(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @PathVariable String id,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(clusteringService.deleteKeywordHierarchy(sessionId, id));
    }
}
