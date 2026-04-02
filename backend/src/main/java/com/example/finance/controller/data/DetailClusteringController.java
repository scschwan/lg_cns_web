package com.example.finance.controller.data;

import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.data.DetailClusteringService;
import com.example.finance.service.project.ProjectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 세부 클러스터링 컨트롤러 (Step 7)
 * ClusteringController와 동일한 엔드포인트 구조이지만 clusterId 파라미터가 추가됨.
 * 모든 작업은 cluster_sub_id 기준으로 동작하며 cluster_id는 절대 수정하지 않음.
 */
@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/sessions/{sessionId}/detail-clustering")
@RequiredArgsConstructor
public class DetailClusteringController {

    private final DetailClusteringService detailClusteringService;
    private final ProjectService projectService;

    @GetMapping("/unmerged")
    public ResponseEntity<Map<String, Object>> getUnmergedClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam int clusterId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(detailClusteringService.getUnmergedClusters(sessionId, clusterId, page, size, keyword));
    }

    @GetMapping("/unmerged-ids")
    public ResponseEntity<List<Integer>> getAllUnmergedClusterNumbers(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam int clusterId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String supplier,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(detailClusteringService.getAllUnmergedClusterNumbers(sessionId, clusterId, keyword, supplier));
    }

    @GetMapping("/keyword-stats")
    public ResponseEntity<List<Map<String, Object>>> getKeywordStats(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam int clusterId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(detailClusteringService.getKeywordStats(sessionId, clusterId));
    }

    @GetMapping("/supplier-stats")
    public ResponseEntity<List<Map<String, Object>>> getSupplierStats(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam int clusterId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(detailClusteringService.getSupplierStats(sessionId, clusterId));
    }

    @GetMapping("/merged")
    public ResponseEntity<List<Map<String, Object>>> getMergedClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam int clusterId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(detailClusteringService.getMergedClusters(sessionId, clusterId));
    }

    @GetMapping("/merged/{clusterNumber}/children")
    public ResponseEntity<Map<String, Object>> getMergedClusterChildren(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @PathVariable int clusterNumber,
            @RequestParam int clusterId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(detailClusteringService.getMergedClusterChildren(sessionId, clusterId, clusterNumber, page, size));
    }

    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> getStatistics(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam int clusterId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(detailClusteringService.getStatistics(sessionId, clusterId));
    }

    @PostMapping("/merge")
    public ResponseEntity<Map<String, Object>> mergeClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        Integer clusterId = ((Number) body.get("clusterId")).intValue();
        @SuppressWarnings("unchecked")
        List<Integer> clusterNumbers = (List<Integer>) body.get("clusterNumbers");
        String customMergeName = (String) body.get("customMergeName");
        return ResponseEntity.ok(detailClusteringService.mergeClusters(sessionId, clusterId, clusterNumbers, customMergeName));
    }

    @PostMapping("/unmerge")
    public ResponseEntity<Map<String, Object>> unmergeClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        Integer clusterId = ((Number) body.get("clusterId")).intValue();
        Integer mergedClusterNumber = (Integer) body.get("mergedClusterNumber");
        return ResponseEntity.ok(detailClusteringService.unmergeClusters(sessionId, clusterId, mergedClusterNumber));
    }

    @PostMapping("/unmerge-partial")
    public ResponseEntity<Map<String, Object>> unmergePartialClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        Integer clusterId = ((Number) body.get("clusterId")).intValue();
        Integer mergedClusterNumber = (Integer) body.get("mergedClusterNumber");
        @SuppressWarnings("unchecked")
        List<Integer> childClusterNumbers = (List<Integer>) body.get("childClusterNumbers");
        return ResponseEntity.ok(
                detailClusteringService.unmergePartialClusters(sessionId, clusterId, mergedClusterNumber, childClusterNumbers));
    }

    @PostMapping("/merge-merged")
    public ResponseEntity<Map<String, Object>> mergeMergedClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        Integer clusterId = ((Number) body.get("clusterId")).intValue();
        @SuppressWarnings("unchecked")
        List<Integer> mergedClusterNumbers = (List<Integer>) body.get("mergedClusterNumbers");
        String customMergeName = (String) body.get("customMergeName");
        return ResponseEntity.ok(detailClusteringService.mergeMergedClusters(sessionId, clusterId, mergedClusterNumbers, customMergeName));
    }

    @PostMapping("/add-to-merged")
    public ResponseEntity<Map<String, Object>> addToMergedCluster(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        Integer clusterId = ((Number) body.get("clusterId")).intValue();
        Integer targetMergedClusterNumber = (Integer) body.get("targetMergedClusterNumber");
        @SuppressWarnings("unchecked")
        List<Integer> clusterNumbers = (List<Integer>) body.get("clusterNumbers");
        return ResponseEntity.ok(
                detailClusteringService.addToMergedCluster(sessionId, clusterId, targetMergedClusterNumber, clusterNumbers));
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
        detailClusteringService.updateClusterName(sessionId, clusterNumber, newName);
        return ResponseEntity.ok(Map.of("success", true));
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

        int clusterId = ((Number) body.get("clusterId")).intValue();
        int page = body.get("page") != null ? ((Number) body.get("page")).intValue() : 0;
        int size = body.get("size") != null ? ((Number) body.get("size")).intValue() : 20;
        String searchColumn = (String) body.get("searchColumn");
        String searchValue = (String) body.get("searchValue");
        boolean exactMatch = Boolean.TRUE.equals(body.get("exactMatch"));
        String excludeValue = (String) body.get("excludeValue");
        boolean excludeExactMatch = Boolean.TRUE.equals(body.get("excludeExactMatch"));

        @SuppressWarnings("unchecked")
        List<Integer> withinClusterNumbers = (List<Integer>) body.get("withinClusterNumbers");

        return ResponseEntity.ok(detailClusteringService.advancedSearch(
                sessionId, clusterId, page, size,
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

        int clusterId = ((Number) body.get("clusterId")).intValue();
        String searchColumn = (String) body.get("searchColumn");
        String searchValue = (String) body.get("searchValue");
        boolean exactMatch = Boolean.TRUE.equals(body.get("exactMatch"));
        String excludeValue = (String) body.get("excludeValue");
        boolean excludeExactMatch = Boolean.TRUE.equals(body.get("excludeExactMatch"));

        @SuppressWarnings("unchecked")
        List<Integer> withinClusterNumbers = (List<Integer>) body.get("withinClusterNumbers");

        return ResponseEntity.ok(detailClusteringService.getAdvancedSearchClusterNumbers(
                sessionId, clusterId,
                searchColumn, searchValue, exactMatch,
                excludeValue, excludeExactMatch,
                withinClusterNumbers));
    }

    @GetMapping("/searchable-columns")
    public ResponseEntity<List<Map<String, String>>> getSearchableColumns(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam int clusterId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(detailClusteringService.getSearchableColumns(sessionId, clusterId));
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
        return ResponseEntity.ok(detailClusteringService.getKeywordHierarchy(projectId));
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
        return ResponseEntity.ok(detailClusteringService.addKeywordHierarchy(projectId, level, parentId, keyword));
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
        return ResponseEntity.ok(detailClusteringService.updateKeywordHierarchy(id, keyword));
    }

    @DeleteMapping("/keyword-hierarchy/{id}")
    public ResponseEntity<Map<String, Object>> deleteKeywordHierarchy(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @PathVariable String id,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(detailClusteringService.deleteKeywordHierarchy(projectId, id));
    }
}
