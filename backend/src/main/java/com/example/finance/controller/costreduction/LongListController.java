package com.example.finance.controller.costreduction;

import com.example.finance.dto.request.costreduction.SaveListRequest;
import com.example.finance.dto.response.costreduction.*;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.costreduction.LongListService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/longlist")
@RequiredArgsConstructor
/**
 * Long List 컨트롤러
 *
 * 원가절감 Long List 기능을 제공한다.
 * 트리 구조 데이터 조회, 통계, 차트 데이터, 항목 선택/저장,
 * 원본 데이터(raw_data) 조회 등의 API를 포함한다.
 *
 * Base Path: /api/projects/{projectId}/longlist
 */
public class LongListController {

    private final LongListService longListService;

    /**
     * Long List 트리 구조 데이터 조회
     *
     * @param projectId 프로젝트 ID
     * @param userPrincipal 인증된 사용자 정보
     * @return 계정 > 클러스터 > 세부클러스터 트리 구조
     */
    @GetMapping("/tree")
    public ResponseEntity<LongListTreeResponse> getTreeData(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        LongListTreeResponse response = longListService.getTreeData(projectId);
        return ResponseEntity.ok(response);
    }

    /**
     * Long List 전체 통계 조회
     *
     * @param projectId 프로젝트 ID
     * @param userPrincipal 인증된 사용자 정보
     * @return 전체 건수, 금액, 선택된 항목 수 등
     */
    @GetMapping("/stats")
    public ResponseEntity<LongListStatsResponse> getStats(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        LongListStatsResponse response = longListService.getStats(projectId);
        return ResponseEntity.ok(response);
    }

    /**
     * 특정 통계 항목의 차트 데이터 조회 (Top N 공급업체/코스트센터)
     *
     * @param statisticsId 통계 ID
     * @param top 상위 N개 (기본값: 5)
     * @return 차트용 데이터 (공급업체별/코스트센터별 집계)
     */
    @GetMapping("/chart/{statisticsId}")
    public ResponseEntity<ChartDataResponse> getChartData(
            @PathVariable String projectId,
            @PathVariable String statisticsId,
            @RequestParam(defaultValue = "5") Integer top,
            @CurrentUser UserPrincipal userPrincipal) {
        ChartDataResponse response = longListService.getChartData(statisticsId, top);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/item-stats/{statisticsId}")
    public ResponseEntity<ItemStatsResponse> getItemStats(
            @PathVariable String projectId,
            @PathVariable String statisticsId,
            @CurrentUser UserPrincipal userPrincipal) {
        ItemStatsResponse response = longListService.getItemStats(projectId, statisticsId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/chart/account/{accountName}")
    public ResponseEntity<ChartDataResponse> getAccountChartData(
            @PathVariable String projectId,
            @PathVariable String accountName,
            @RequestParam(defaultValue = "5") Integer top,
            @CurrentUser UserPrincipal userPrincipal) {
        ChartDataResponse response = longListService.getAccountChartData(projectId, accountName, top);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/item-stats/account/{accountName}")
    public ResponseEntity<ItemStatsResponse> getAccountItemStats(
            @PathVariable String projectId,
            @PathVariable String accountName,
            @CurrentUser UserPrincipal userPrincipal) {
        ItemStatsResponse response = longListService.getAccountItemStats(projectId, accountName);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/save")
    public ResponseEntity<Map<String, Integer>> saveSelections(
            @PathVariable String projectId,
            @RequestBody SaveListRequest request,
            @CurrentUser UserPrincipal userPrincipal) {
        int savedCount = longListService.saveSelections(projectId, request);
        return ResponseEntity.ok(Map.of("savedCount", savedCount));
    }

    /**
     * statisticsId 목록만으로 Long List 저장 (경량 요청 - WAF body size 제한 우회)
     */
    @PostMapping("/save-by-ids")
    public ResponseEntity<Map<String, Integer>> saveSelectionsByIds(
            @PathVariable String projectId,
            @RequestBody Map<String, List<String>> request,
            @CurrentUser UserPrincipal userPrincipal) {
        List<String> statisticsIds = request.getOrDefault("statisticsIds", List.of());
        int savedCount = longListService.saveSelectionsByIds(projectId, statisticsIds);
        return ResponseEntity.ok(Map.of("savedCount", savedCount));
    }

    @GetMapping("/selections")
    public ResponseEntity<Map<String, List<SaveListRequest.ListItemDto>>> getSelections(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        List<SaveListRequest.ListItemDto> items = longListService.getSelections(projectId);
        return ResponseEntity.ok(Map.of("items", items));
    }

    @GetMapping("/raw-data/{statisticsId}")
    public ResponseEntity<RawDataPageResponse> getRawData(
            @PathVariable String projectId,
            @PathVariable String statisticsId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @CurrentUser UserPrincipal userPrincipal) {
        RawDataPageResponse response = longListService.getRawData(statisticsId, page, size);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/raw-data/account/{accountName}")
    public ResponseEntity<RawDataPageResponse> getAccountRawData(
            @PathVariable String projectId,
            @PathVariable String accountName,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @CurrentUser UserPrincipal userPrincipal) {
        RawDataPageResponse response = longListService.getAccountRawData(projectId, accountName, page, size);
        return ResponseEntity.ok(response);
    }
}
