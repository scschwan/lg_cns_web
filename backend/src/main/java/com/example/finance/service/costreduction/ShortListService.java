package com.example.finance.service.costreduction;

import com.example.finance.dto.request.costreduction.SaveListRequest;
import com.example.finance.dto.response.costreduction.*;
import com.example.finance.model.costreduction.LongShortList;
import com.example.finance.model.data.ClusterStatistics;
import com.example.finance.repository.costreduction.LongShortListRepository;
import com.example.finance.repository.data.ClusterStatisticsRepository;
import com.example.finance.service.common.RedisService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShortListService {

    private final LongShortListRepository longShortListRepository;
    private final ClusterStatisticsRepository clusterStatisticsRepository;
    private final RedisService redisService;
    private final ObjectMapper objectMapper;

    private static final Duration CACHE_TTL = Duration.ofMinutes(30);

    /**
     * Short List 트리 데이터 조회 (Long List 선택 항목 기반)
     */
    public LongListTreeResponse getShortListTree(String projectId) {
        String cacheKey = "shortlist:tree:" + projectId;
        Object cached = redisService.get(cacheKey);
        if (cached != null) {
            try {
                List<TreeNode> tree = objectMapper.convertValue(cached, new TypeReference<>() {});
                return new LongListTreeResponse(tree);
            } catch (Exception e) {
                log.warn("Failed to deserialize cached short list tree", e);
            }
        }

        LongShortList list = longShortListRepository.findFirstByProjectId(projectId)
                .orElseThrow(() -> new RuntimeException("Long List 데이터를 찾을 수 없습니다: " + projectId));

        List<LongShortList.ListItem> longListItems = list.getLongListItems();
        if (longListItems == null || longListItems.isEmpty()) {
            return new LongListTreeResponse(Collections.emptyList());
        }

        // statisticsId로 ClusterStatistics 조회하여 상세 정보 획득
        Set<String> statsIds = longListItems.stream()
                .map(LongShortList.ListItem::getStatisticsId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Map<String, ClusterStatistics> statsMap = clusterStatisticsRepository.findAllById(statsIds).stream()
                .collect(Collectors.toMap(ClusterStatistics::getId, s -> s));

        // accountName 기준 그룹핑
        Map<String, List<LongShortList.ListItem>> itemsByAccount = longListItems.stream()
                .collect(Collectors.groupingBy(LongShortList.ListItem::getAccountName));

        List<TreeNode> tree = new ArrayList<>();

        for (Map.Entry<String, List<LongShortList.ListItem>> entry : itemsByAccount.entrySet()) {
            String accountName = entry.getKey();
            List<LongShortList.ListItem> items = entry.getValue();

            // Level 2 (중분류) 항목들
            List<LongShortList.ListItem> level2Items = items.stream()
                    .filter(i -> i.getLevel() != null && i.getLevel() == 2)
                    .toList();
            // Level 3 (소분류) 항목들
            List<LongShortList.ListItem> level3Items = items.stream()
                    .filter(i -> i.getLevel() != null && i.getLevel() == 3)
                    .toList();

            // Level 3 항목을 parentClusterNumber + sessionId 기준 그룹핑
            Map<String, List<LongShortList.ListItem>> level3ByParent = level3Items.stream()
                    .collect(Collectors.groupingBy(
                            i -> i.getSessionId() + ":" + i.getParentClusterNumber()
                    ));

            List<TreeNode> clusterNodes = level2Items.stream().map(l2 -> {
                String parentKey = l2.getSessionId() + ":" + l2.getClusterNumber();
                List<LongShortList.ListItem> subItems = level3ByParent.getOrDefault(parentKey, Collections.emptyList());

                List<TreeNode> subChildren = subItems.stream()
                        .map(sub -> toTreeNode(sub, statsMap.get(sub.getStatisticsId())))
                        .toList();

                TreeNode node = toTreeNode(l2, statsMap.get(l2.getStatisticsId()));
                node.setChildren(new ArrayList<>(subChildren));
                return node;
            }).toList();

            // 대분류 노드 (합산)
            int totalCount = items.stream().mapToInt(i -> i.getTotalCount() != null ? i.getTotalCount() : 0).sum();
            double totalAmount = items.stream().mapToDouble(i -> i.getTotalAmount() != null ? i.getTotalAmount() : 0.0).sum();

            // supplierCount / costCenterCount는 ClusterStatistics에서 가져옴
            int supplierCount = items.stream()
                    .map(i -> statsMap.get(i.getStatisticsId()))
                    .filter(Objects::nonNull)
                    .mapToInt(s -> s.getSupplierCount() != null ? s.getSupplierCount() : 0)
                    .sum();
            int costCenterCount = items.stream()
                    .map(i -> statsMap.get(i.getStatisticsId()))
                    .filter(Objects::nonNull)
                    .mapToInt(s -> s.getCostCenterCount() != null ? s.getCostCenterCount() : 0)
                    .sum();

            TreeNode accountNode = TreeNode.builder()
                    .id("account:" + accountName)
                    .accountName(accountName)
                    .level(1)
                    .totalCount(totalCount)
                    .totalAmount(totalAmount)
                    .supplierCount(supplierCount)
                    .costCenterCount(costCenterCount)
                    .children(new ArrayList<>(clusterNodes))
                    .build();

            tree.add(accountNode);
        }

        try {
            redisService.set(cacheKey, tree, CACHE_TTL);
        } catch (Exception e) {
            log.warn("Failed to cache short list tree", e);
        }

        return new LongListTreeResponse(tree);
    }

    /**
     * Short List 요약 통계
     */
    public ShortListStatsResponse getShortListStats(String projectId) {
        LongShortList list = longShortListRepository.findFirstByProjectId(projectId)
                .orElse(null);

        if (list == null || list.getLongListItems() == null) {
            return ShortListStatsResponse.builder()
                    .longListItemCount(0)
                    .shortListItemCount(0)
                    .totalAmount(0.0)
                    .selectionRatio(0.0)
                    .build();
        }

        List<LongShortList.ListItem> longItems = list.getLongListItems();
        List<LongShortList.ListItem> shortItems = list.getShortListItems() != null
                ? list.getShortListItems() : Collections.emptyList();

        double longListTotal = longItems.stream()
                .mapToDouble(i -> i.getTotalAmount() != null ? i.getTotalAmount() : 0.0)
                .sum();
        double shortListTotal = shortItems.stream()
                .mapToDouble(i -> i.getTotalAmount() != null ? i.getTotalAmount() : 0.0)
                .sum();

        double selectionRatio = longListTotal > 0 ? (shortListTotal / longListTotal) * 100 : 0.0;

        return ShortListStatsResponse.builder()
                .longListItemCount(longItems.size())
                .shortListItemCount(shortItems.size())
                .totalAmount(longListTotal)
                .shortListTotalAmount(shortListTotal)
                .selectionRatio(Math.round(selectionRatio * 100.0) / 100.0)
                .build();
    }

    /**
     * 차트 데이터 조회 (Long List와 동일 로직 - ClusterStatistics 기반)
     */
    public ChartDataResponse getChartData(String statisticsId, Integer top) {
        String cacheKey = "shortlist:chart:" + statisticsId + ":" + top;
        Object cached = redisService.get(cacheKey);
        if (cached != null) {
            try {
                return objectMapper.convertValue(cached, ChartDataResponse.class);
            } catch (Exception e) {
                log.warn("Failed to deserialize cached chart data", e);
            }
        }

        ClusterStatistics stats = clusterStatisticsRepository.findById(statisticsId)
                .orElseThrow(() -> new RuntimeException("통계 데이터를 찾을 수 없습니다: " + statisticsId));

        List<ChartDataResponse.BreakdownItemDto> suppliers = topNWithOthers(stats.getSupplierBreakdown(), top);
        List<ChartDataResponse.BreakdownItemDto> costCenters = topNWithOthers(stats.getCostCenterBreakdown(), top);

        ChartDataResponse response = ChartDataResponse.builder()
                .supplierBreakdown(suppliers)
                .costCenterBreakdown(costCenters)
                .build();

        try {
            redisService.set(cacheKey, response, CACHE_TTL);
        } catch (Exception e) {
            log.warn("Failed to cache chart data", e);
        }

        return response;
    }

    /**
     * 항목별 상세 통계
     */
    public ItemStatsResponse getItemStats(String projectId, String statisticsId) {
        ClusterStatistics stats = clusterStatisticsRepository.findById(statisticsId)
                .orElseThrow(() -> new RuntimeException("통계 데이터를 찾을 수 없습니다: " + statisticsId));

        // Long List 전체 금액 기준 비율 계산
        LongShortList list = longShortListRepository.findFirstByProjectId(projectId).orElse(null);
        double longListTotal = 0.0;
        if (list != null && list.getLongListItems() != null) {
            longListTotal = list.getLongListItems().stream()
                    .mapToDouble(i -> i.getTotalAmount() != null ? i.getTotalAmount() : 0.0)
                    .sum();
        }

        double ratio = longListTotal > 0
                ? (stats.getTotalAmount() != null ? stats.getTotalAmount() : 0.0) / longListTotal * 100
                : 0.0;

        return ItemStatsResponse.builder()
                .rawDataRows(stats.getTotalCount())
                .supplierCount(stats.getSupplierCount())
                .costCenterCount(stats.getCostCenterCount())
                .totalAmount(stats.getTotalAmount())
                .ratioToTotal(Math.round(ratio * 100.0) / 100.0)
                .build();
    }

    /**
     * Short List 선택 항목 저장
     */
    public int saveShortListSelections(String projectId, SaveListRequest request) {
        LongShortList list = longShortListRepository.findFirstByProjectId(projectId)
                .orElseThrow(() -> new RuntimeException("Long List 데이터를 찾을 수 없습니다: " + projectId));

        List<LongShortList.ListItem> items = request.getItems().stream()
                .map(dto -> LongShortList.ListItem.builder()
                        .statisticsId(dto.getStatisticsId())
                        .sessionId(dto.getSessionId())
                        .accountName(dto.getAccountName())
                        .clusterNumber(dto.getClusterNumber())
                        .clusterName(dto.getClusterName())
                        .level(dto.getLevel())
                        .parentClusterNumber(dto.getParentClusterNumber())
                        .totalAmount(dto.getTotalAmount())
                        .totalCount(dto.getTotalCount())
                        .build())
                .toList();

        list.setShortListItems(items);
        list.setUpdatedAt(LocalDateTime.now());
        longShortListRepository.save(list);

        // 캐시 무효화
        redisService.delete("shortlist:tree:" + projectId);

        return items.size();
    }

    /**
     * 저장된 Short List 선택 항목 조회
     */
    public List<SaveListRequest.ListItemDto> getShortListSelections(String projectId) {
        return longShortListRepository.findFirstByProjectId(projectId)
                .map(list -> {
                    List<LongShortList.ListItem> shortItems = list.getShortListItems();
                    if (shortItems == null) return Collections.<SaveListRequest.ListItemDto>emptyList();
                    return shortItems.stream()
                            .map(item -> SaveListRequest.ListItemDto.builder()
                                    .statisticsId(item.getStatisticsId())
                                    .sessionId(item.getSessionId())
                                    .accountName(item.getAccountName())
                                    .clusterNumber(item.getClusterNumber())
                                    .clusterName(item.getClusterName())
                                    .level(item.getLevel())
                                    .parentClusterNumber(item.getParentClusterNumber())
                                    .totalAmount(item.getTotalAmount())
                                    .totalCount(item.getTotalCount())
                                    .build())
                            .toList();
                })
                .orElse(Collections.emptyList());
    }

    private TreeNode toTreeNode(LongShortList.ListItem item, ClusterStatistics stats) {
        int supplierCount = stats != null && stats.getSupplierCount() != null ? stats.getSupplierCount() : 0;
        int costCenterCount = stats != null && stats.getCostCenterCount() != null ? stats.getCostCenterCount() : 0;

        return TreeNode.builder()
                .id(item.getStatisticsId())
                .statisticsId(item.getStatisticsId())
                .sessionId(item.getSessionId())
                .accountName(item.getAccountName())
                .clusterNumber(item.getClusterNumber())
                .clusterName(item.getClusterName())
                .level(item.getLevel())
                .parentClusterNumber(item.getParentClusterNumber())
                .totalCount(item.getTotalCount())
                .totalAmount(item.getTotalAmount())
                .supplierCount(supplierCount)
                .costCenterCount(costCenterCount)
                .children(new ArrayList<>())
                .build();
    }

    private List<ChartDataResponse.BreakdownItemDto> topNWithOthers(
            List<ClusterStatistics.BreakdownItem> items, Integer top) {
        if (items == null || items.isEmpty()) {
            return Collections.emptyList();
        }

        if (top == null || items.size() <= top) {
            return items.stream()
                    .map(item -> ChartDataResponse.BreakdownItemDto.builder()
                            .name(item.getName())
                            .count(item.getCount())
                            .totalAmount(item.getTotalAmount())
                            .build())
                    .toList();
        }

        List<ChartDataResponse.BreakdownItemDto> result = new ArrayList<>();
        for (int i = 0; i < top; i++) {
            ClusterStatistics.BreakdownItem item = items.get(i);
            result.add(ChartDataResponse.BreakdownItemDto.builder()
                    .name(item.getName())
                    .count(item.getCount())
                    .totalAmount(item.getTotalAmount())
                    .build());
        }

        int othersCount = 0;
        double othersAmount = 0.0;
        for (int i = top; i < items.size(); i++) {
            ClusterStatistics.BreakdownItem item = items.get(i);
            othersCount += item.getCount() != null ? item.getCount() : 0;
            othersAmount += item.getTotalAmount() != null ? item.getTotalAmount() : 0.0;
        }

        result.add(ChartDataResponse.BreakdownItemDto.builder()
                .name("기타")
                .count(othersCount)
                .totalAmount(othersAmount)
                .build());

        return result;
    }
}
