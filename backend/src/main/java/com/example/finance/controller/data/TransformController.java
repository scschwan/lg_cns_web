package com.example.finance.controller.data;

import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.data.DataTransformService;
import com.example.finance.service.project.ProjectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 데이터 변환 컨트롤러 (Step 4: Transform)
 *
 * Base path: /api/projects/{projectId}/sessions/{sessionId}/transform
 */
@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/sessions/{sessionId}/transform")
@RequiredArgsConstructor
public class TransformController {

    private final DataTransformService dataTransformService;
    private final ProjectService projectService;

    /**
     * 키워드 통계 조회 (group by count + money 합산)
     */
    @GetMapping("/keyword-stats")
    public ResponseEntity<List<DataTransformService.KeywordSummary>> getKeywordStats(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(dataTransformService.getKeywordStats(sessionId));
    }

    /**
     * 키워드 검색 (like 검색)
     */
    @GetMapping("/search-keywords")
    public ResponseEntity<List<DataTransformService.KeywordSummary>> searchKeywords(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam String keyword,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(dataTransformService.searchKeywords(sessionId, keyword));
    }

    /**
     * 키워드 변환 (치환)
     */
    @PostMapping("/replace-keywords")
    public ResponseEntity<Map<String, Object>> replaceKeywords(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());

        @SuppressWarnings("unchecked")
        List<String> fromKeywords = (List<String>) body.get("fromKeywords");
        String toKeyword = (String) body.get("toKeyword");

        return ResponseEntity.ok(dataTransformService.replaceKeywords(sessionId, fromKeywords, toKeyword));
    }

    /**
     * 원본 데이터 조회 (visible columns + 페이징 + 키워드 필터)
     */
    @GetMapping("/original-data")
    public ResponseEntity<Map<String, Object>> getOriginalData(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) String keyword,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(dataTransformService.getOriginalData(sessionId, page, size, keyword));
    }

    /**
     * 검색 결과 데이터 조회 (visible columns + 페이징 + 키워드 필터)
     */
    @GetMapping("/search-data")
    public ResponseEntity<Map<String, Object>> getSearchData(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) String keyword,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(dataTransformService.getSearchResultData(sessionId, page, size, keyword));
    }
}
