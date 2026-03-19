package com.example.finance.controller.costreduction;

import com.example.finance.dto.request.costreduction.SaveListRequest;
import com.example.finance.dto.response.costreduction.*;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.costreduction.ShortListService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/shortlist")
@RequiredArgsConstructor
/**
 * Short List 컨트롤러
 *
 * 원가절감 Short List 기능을 제공한다.
 * Long List에서 선택된 항목 기반으로 트리 구조 조회, 통계, 차트 데이터,
 * 항목 선택/저장, 원본 데이터 조회 등의 API를 포함한다.
 *
 * Base Path: /api/projects/{projectId}/shortlist
 */
public class ShortListController {

    private final ShortListService shortListService;

    @GetMapping("/tree")
    public ResponseEntity<LongListTreeResponse> getTreeData(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        LongListTreeResponse response = shortListService.getShortListTree(projectId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/stats")
    public ResponseEntity<ShortListStatsResponse> getStats(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        ShortListStatsResponse response = shortListService.getShortListStats(projectId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/chart/{statisticsId}")
    public ResponseEntity<ChartDataResponse> getChartData(
            @PathVariable String projectId,
            @PathVariable String statisticsId,
            @RequestParam(defaultValue = "5") Integer top,
            @CurrentUser UserPrincipal userPrincipal) {
        ChartDataResponse response = shortListService.getChartData(statisticsId, top);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/item-stats/{statisticsId}")
    public ResponseEntity<ItemStatsResponse> getItemStats(
            @PathVariable String projectId,
            @PathVariable String statisticsId,
            @CurrentUser UserPrincipal userPrincipal) {
        ItemStatsResponse response = shortListService.getItemStats(projectId, statisticsId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/chart/account/{accountName}")
    public ResponseEntity<ChartDataResponse> getAccountChartData(
            @PathVariable String projectId,
            @PathVariable String accountName,
            @RequestParam(defaultValue = "5") Integer top,
            @CurrentUser UserPrincipal userPrincipal) {
        ChartDataResponse response = shortListService.getAccountChartData(projectId, accountName, top);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/item-stats/account/{accountName}")
    public ResponseEntity<ItemStatsResponse> getAccountItemStats(
            @PathVariable String projectId,
            @PathVariable String accountName,
            @CurrentUser UserPrincipal userPrincipal) {
        ItemStatsResponse response = shortListService.getAccountItemStats(projectId, accountName);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/selection-tree")
    public ResponseEntity<LongListTreeResponse> getSelectionTree(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        LongListTreeResponse response = shortListService.getShortListSelectionTree(projectId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/save")
    public ResponseEntity<Map<String, Integer>> saveSelections(
            @PathVariable String projectId,
            @RequestBody SaveListRequest request,
            @CurrentUser UserPrincipal userPrincipal) {
        int savedCount = shortListService.saveShortListSelections(projectId, request);
        return ResponseEntity.ok(Map.of("savedCount", savedCount));
    }

    @GetMapping("/selections")
    public ResponseEntity<Map<String, List<SaveListRequest.ListItemDto>>> getSelections(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        List<SaveListRequest.ListItemDto> items = shortListService.getShortListSelections(projectId);
        return ResponseEntity.ok(Map.of("items", items));
    }

    @GetMapping("/raw-data/{statisticsId}")
    public ResponseEntity<RawDataPageResponse> getRawData(
            @PathVariable String projectId,
            @PathVariable String statisticsId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @CurrentUser UserPrincipal userPrincipal) {
        RawDataPageResponse response = shortListService.getRawData(statisticsId, page, size);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/raw-data/account/{accountName}")
    public ResponseEntity<RawDataPageResponse> getAccountRawData(
            @PathVariable String projectId,
            @PathVariable String accountName,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @CurrentUser UserPrincipal userPrincipal) {
        RawDataPageResponse response = shortListService.getAccountRawData(projectId, accountName, page, size);
        return ResponseEntity.ok(response);
    }
}
