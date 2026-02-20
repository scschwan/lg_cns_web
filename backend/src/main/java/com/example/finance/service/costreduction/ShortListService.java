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

            // 대분류 노드 (합산) - Level 2 항목만 합산 (Level 3는 Level 2에 포함되어 있으므로 중복 방지)
            int totalCount = level2Items.stream().mapToInt(i -> i.getTotalCount() != null ? i.getTotalCount() : 0).sum();
            double totalAmount = level2Items.stream().mapToDouble(i -> i.getTotalAmount() != null ? i.getTotalAmount() : 0.0).sum();

            // supplierCount / costCenterCount는 ClusterStatistics에서 가져옴 (Level 2만)
            int supplierCount = level2Items.stream()
                    .map(i -> statsMap.get(i.getStatisticsId()))
                    .filter(Objects::nonNull)
                    .mapToInt(s -> s.getSupplierCount() != null ? s.getSupplierCount() : 0)
                    .sum();
            int costCenterCount = level2Items.stream()
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

        // Level 2 항목만 집계 (Level 2 + Level 3 모두 저장되므로, Level 2만 합산하여 중복 방지)
        List<LongShortList.ListItem> longLevel2 = longItems.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 2)
                .toList();
        List<LongShortList.ListItem> shortLevel2 = shortItems.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 2)
                .toList();

        double longListTotal = longLevel2.stream()
                .mapToDouble(i -> i.getTotalAmount() != null ? i.getTotalAmount() : 0.0)
                .sum();
        double shortListTotal = shortLevel2.stream()
                .mapToDouble(i -> i.getTotalAmount() != null ? i.getTotalAmount() : 0.0)
                .sum();

        double selectionRatio = longListTotal > 0 ? (shortListTotal / longListTotal) * 100 : 0.0;

        return ShortListStatsResponse.builder()
                .longListItemCount(longLevel2.size())
                .shortListItemCount(shortLevel2.size())
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
     * 계정명(Account) 수준 차트 데이터 조회 (하위 Level 2 항목 집계)
     */
    public ChartDataResponse getAccountChartData(String projectId, String accountName, Integer top) {
        LongShortList list = longShortListRepository.findFirstByProjectId(projectId)
                .orElseThrow(() -> new RuntimeException("Long List 데이터를 찾을 수 없습니다: " + projectId));

        List<LongShortList.ListItem> longListItems = list.getLongListItems();
        if (longListItems == null) {
            return ChartDataResponse.builder()
                    .supplierBreakdown(Collections.emptyList())
                    .costCenterBreakdown(Collections.emptyList())
                    .build();
        }

        // 해당 계정명의 Level 2 항목들의 statisticsId 수집
        Set<String> statsIds = longListItems.stream()
                .filter(i -> accountName.equals(i.getAccountName()) && i.getLevel() != null && i.getLevel() == 2)
                .map(LongShortList.ListItem::getStatisticsId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        List<ClusterStatistics> statsList = clusterStatisticsRepository.findAllById(statsIds).stream().toList();

        // 공급업체 breakdown 합산
        Map<String, ChartDataResponse.BreakdownItemDto> supplierMap = new LinkedHashMap<>();
        Map<String, ChartDataResponse.BreakdownItemDto> costCenterMap = new LinkedHashMap<>();

        for (ClusterStatistics stats : statsList) {
            if (stats.getSupplierBreakdown() != null) {
                for (ClusterStatistics.BreakdownItem item : stats.getSupplierBreakdown()) {
                    supplierMap.merge(item.getName(),
                            ChartDataResponse.BreakdownItemDto.builder()
                                    .name(item.getName())
                                    .count(item.getCount() != null ? item.getCount() : 0)
                                    .totalAmount(item.getTotalAmount() != null ? item.getTotalAmount() : 0.0)
                                    .build(),
                            (a, b) -> ChartDataResponse.BreakdownItemDto.builder()
                                    .name(a.getName())
                                    .count(a.getCount() + b.getCount())
                                    .totalAmount(a.getTotalAmount() + b.getTotalAmount())
                                    .build());
                }
            }
            if (stats.getCostCenterBreakdown() != null) {
                for (ClusterStatistics.BreakdownItem item : stats.getCostCenterBreakdown()) {
                    costCenterMap.merge(item.getName(),
                            ChartDataResponse.BreakdownItemDto.builder()
                                    .name(item.getName())
                                    .count(item.getCount() != null ? item.getCount() : 0)
                                    .totalAmount(item.getTotalAmount() != null ? item.getTotalAmount() : 0.0)
                                    .build(),
                            (a, b) -> ChartDataResponse.BreakdownItemDto.builder()
                                    .name(a.getName())
                                    .count(a.getCount() + b.getCount())
                                    .totalAmount(a.getTotalAmount() + b.getTotalAmount())
                                    .build());
                }
            }
        }

        // 금액 기준 내림차순 정렬 후 Top N 처리
        List<ChartDataResponse.BreakdownItemDto> suppliers = supplierMap.values().stream()
                .sorted(Comparator.comparingDouble(ChartDataResponse.BreakdownItemDto::getTotalAmount).reversed())
                .toList();
        List<ChartDataResponse.BreakdownItemDto> costCenters = costCenterMap.values().stream()
                .sorted(Comparator.comparingDouble(ChartDataResponse.BreakdownItemDto::getTotalAmount).reversed())
                .toList();

        return ChartDataResponse.builder()
                .supplierBreakdown(applyTopN(suppliers, top))
                .costCenterBreakdown(applyTopN(costCenters, top))
                .build();
    }

    /**
     * 계정명(Account) 수준 상세 통계
     */
    public ItemStatsResponse getAccountItemStats(String projectId, String accountName) {
        LongShortList list = longShortListRepository.findFirstByProjectId(projectId)
                .orElseThrow(() -> new RuntimeException("Long List 데이터를 찾을 수 없습니다: " + projectId));

        List<LongShortList.ListItem> longListItems = list.getLongListItems();
        if (longListItems == null) {
            return ItemStatsResponse.builder().build();
        }

        // 해당 계정명의 Level 2 항목들
        Set<String> statsIds = longListItems.stream()
                .filter(i -> accountName.equals(i.getAccountName()) && i.getLevel() != null && i.getLevel() == 2)
                .map(LongShortList.ListItem::getStatisticsId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        List<ClusterStatistics> statsList = clusterStatisticsRepository.findAllById(statsIds).stream().toList();

        int rawDataRows = statsList.stream().mapToInt(s -> s.getTotalCount() != null ? s.getTotalCount() : 0).sum();
        int supplierCount = statsList.stream().mapToInt(s -> s.getSupplierCount() != null ? s.getSupplierCount() : 0).sum();
        int costCenterCount = statsList.stream().mapToInt(s -> s.getCostCenterCount() != null ? s.getCostCenterCount() : 0).sum();
        double totalAmount = statsList.stream().mapToDouble(s -> s.getTotalAmount() != null ? s.getTotalAmount() : 0.0).sum();

        // 전체 Long List 금액 대비 비율
        double longListTotal = longListItems.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 2)
                .mapToDouble(i -> i.getTotalAmount() != null ? i.getTotalAmount() : 0.0)
                .sum();
        double ratio = longListTotal > 0 ? totalAmount / longListTotal * 100 : 0.0;

        return ItemStatsResponse.builder()
                .rawDataRows(rawDataRows)
                .supplierCount(supplierCount)
                .costCenterCount(costCenterCount)
                .totalAmount(totalAmount)
                .ratioToTotal(Math.round(ratio * 100.0) / 100.0)
                .build();
    }

    /**
     * Short List 선택 항목 기반 트리 데이터 조회 (Able 과제 등록 페이지용)
     * longListItems가 아닌 shortListItems를 기반으로 트리를 구성
     */
    public LongListTreeResponse getShortListSelectionTree(String projectId) {
        LongShortList list = longShortListRepository.findFirstByProjectId(projectId)
                .orElseThrow(() -> new RuntimeException("Long List 데이터를 찾을 수 없습니다: " + projectId));

        List<LongShortList.ListItem> shortListItems = list.getShortListItems();
        if (shortListItems == null || shortListItems.isEmpty()) {
            return new LongListTreeResponse(Collections.emptyList());
        }

        Set<String> statsIds = shortListItems.stream()
                .map(LongShortList.ListItem::getStatisticsId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Map<String, ClusterStatistics> statsMap = clusterStatisticsRepository.findAllById(statsIds).stream()
                .collect(Collectors.toMap(ClusterStatistics::getId, s -> s));

        Map<String, List<LongShortList.ListItem>> itemsByAccount = shortListItems.stream()
                .collect(Collectors.groupingBy(LongShortList.ListItem::getAccountName));

        List<TreeNode> tree = new ArrayList<>();

        for (Map.Entry<String, List<LongShortList.ListItem>> entry : itemsByAccount.entrySet()) {
            String accountName = entry.getKey();
            List<LongShortList.ListItem> items = entry.getValue();

            List<LongShortList.ListItem> level2Items = items.stream()
                    .filter(i -> i.getLevel() != null && i.getLevel() == 2).toList();
            List<LongShortList.ListItem> level3Items = items.stream()
                    .filter(i -> i.getLevel() != null && i.getLevel() == 3).toList();

            Map<String, List<LongShortList.ListItem>> level3ByParent = level3Items.stream()
                    .collect(Collectors.groupingBy(i -> i.getSessionId() + ":" + i.getParentClusterNumber()));

            List<TreeNode> clusterNodes = level2Items.stream().map(l2 -> {
                String parentKey = l2.getSessionId() + ":" + l2.getClusterNumber();
                List<LongShortList.ListItem> subItems = level3ByParent.getOrDefault(parentKey, Collections.emptyList());
                List<TreeNode> subChildren = subItems.stream()
                        .map(sub -> toTreeNode(sub, statsMap.get(sub.getStatisticsId()))).toList();
                TreeNode node = toTreeNode(l2, statsMap.get(l2.getStatisticsId()));
                node.setChildren(new ArrayList<>(subChildren));
                return node;
            }).toList();

            int totalCount = level2Items.stream().mapToInt(i -> i.getTotalCount() != null ? i.getTotalCount() : 0).sum();
            double totalAmount = level2Items.stream().mapToDouble(i -> i.getTotalAmount() != null ? i.getTotalAmount() : 0.0).sum();
            int supplierCount = level2Items.stream().map(i -> statsMap.get(i.getStatisticsId()))
                    .filter(Objects::nonNull).mapToInt(s -> s.getSupplierCount() != null ? s.getSupplierCount() : 0).sum();
            int costCenterCount = level2Items.stream().map(i -> statsMap.get(i.getStatisticsId()))
                    .filter(Objects::nonNull).mapToInt(s -> s.getCostCenterCount() != null ? s.getCostCenterCount() : 0).sum();

            tree.add(TreeNode.builder()
                    .id("account:" + accountName).accountName(accountName).level(1)
                    .totalCount(totalCount).totalAmount(totalAmount)
                    .supplierCount(supplierCount).costCenterCount(costCenterCount)
                    .children(new ArrayList<>(clusterNodes)).build());
        }

        return new LongListTreeResponse(tree);
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

    private List<ChartDataResponse.BreakdownItemDto> applyTopN(
            List<ChartDataResponse.BreakdownItemDto> items, Integer top) {
        if (items == null || items.isEmpty()) return Collections.emptyList();
        if (top == null || items.size() <= top) return items;

        List<ChartDataResponse.BreakdownItemDto> result = new ArrayList<>(items.subList(0, top));
        int othersCount = 0;
        double othersAmount = 0.0;
        for (int i = top; i < items.size(); i++) {
            othersCount += items.get(i).getCount() != null ? items.get(i).getCount() : 0;
            othersAmount += items.get(i).getTotalAmount() != null ? items.get(i).getTotalAmount() : 0.0;
        }
        result.add(ChartDataResponse.BreakdownItemDto.builder()
                .name("기타").count(othersCount).totalAmount(othersAmount).build());
        return result;
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
