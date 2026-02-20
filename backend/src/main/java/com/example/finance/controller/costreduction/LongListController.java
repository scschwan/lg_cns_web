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
public class LongListController {

    private final LongListService longListService;

    @GetMapping("/tree")
    public ResponseEntity<LongListTreeResponse> getTreeData(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        LongListTreeResponse response = longListService.getTreeData(projectId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/stats")
    public ResponseEntity<LongListStatsResponse> getStats(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        LongListStatsResponse response = longListService.getStats(projectId);
        return ResponseEntity.ok(response);
    }

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

    @PostMapping("/save")
    public ResponseEntity<Map<String, Integer>> saveSelections(
            @PathVariable String projectId,
            @RequestBody SaveListRequest request,
            @CurrentUser UserPrincipal userPrincipal) {
        int savedCount = longListService.saveSelections(projectId, request);
        return ResponseEntity.ok(Map.of("savedCount", savedCount));
    }

    @GetMapping("/selections")
    public ResponseEntity<Map<String, List<SaveListRequest.ListItemDto>>> getSelections(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal) {
        List<SaveListRequest.ListItemDto> items = longListService.getSelections(projectId);
        return ResponseEntity.ok(Map.of("items", items));
    }
}
