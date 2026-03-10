package com.example.finance.service.costreduction;

import com.example.finance.dto.request.costreduction.SaveListRequest;
import com.example.finance.dto.response.costreduction.*;
import com.example.finance.model.costreduction.AbleTask;
import com.example.finance.model.costreduction.LongShortList;
import com.example.finance.model.data.ClusterStatistics;
import com.example.finance.model.data.SessionDataDocument;
import com.example.finance.repository.costreduction.AbleTaskRepository;
import com.example.finance.repository.costreduction.LongShortListRepository;
import com.example.finance.repository.data.ClusterStatisticsRepository;
import com.example.finance.repository.data.SessionDataRepository;
import com.example.finance.service.common.RedisService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
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
    private final AbleTaskRepository ableTaskRepository;
    private final ClusterStatisticsRepository clusterStatisticsRepository;
    private final SessionDataRepository sessionDataRepository;
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
                .orElse(null);

        if (list == null) {
            log.debug("[ShortList] LongShortList 미존재, 빈 트리 반환: projectId={}", projectId);
            return new LongListTreeResponse(Collections.emptyList());
        }

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
                // 세부 클러스터가 있으면 선택된 것들의 합산으로 금액/건수 재계산
                if (!subItems.isEmpty()) {
                    double recalcAmount = subItems.stream()
                            .mapToDouble(s -> s.getTotalAmount() != null ? s.getTotalAmount() : 0.0).sum();
                    int recalcCount = subItems.stream()
                            .mapToInt(s -> s.getTotalCount() != null ? s.getTotalCount() : 0).sum();
                    node.setTotalAmount(recalcAmount);
                    node.setTotalCount(recalcCount);
                }
                node.setChildren(new ArrayList<>(subChildren));
                return node;
            }).toList();

            // 대분류 노드 (합산) - Level 2 항목 합산 (세부 클러스터가 있는 경우 재계산된 금액 사용)
            int totalCount = clusterNodes.stream().mapToInt(n -> n.getTotalCount() != null ? n.getTotalCount() : 0).sum();
            double totalAmount = clusterNodes.stream().mapToDouble(n -> n.getTotalAmount() != null ? n.getTotalAmount() : 0.0).sum();

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
        // 단, Level 3 세부 클러스터가 일부 제외된 경우 Level 2 금액을 Level 3 합산으로 재계산
        double longListTotal = recalculateLevel2Total(longItems);
        double shortListTotal = recalculateLevel2Total(shortItems);

        List<LongShortList.ListItem> longLevel2 = longItems.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 2)
                .toList();
        List<LongShortList.ListItem> shortLevel2 = shortItems.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 2)
                .toList();

        double selectionRatio = longListTotal > 0 ? (shortListTotal / longListTotal) * 100 : 0.0;

        // 세분화 건수 계산 (계정명/클러스터/세부클러스터)
        long longAccountCount = longItems.stream()
                .map(LongShortList.ListItem::getAccountName)
                .filter(a -> a != null)
                .distinct().count();
        long longClusterCount = longItems.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 2)
                .count();
        long longSubClusterCount = longItems.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 3)
                .count();
        long shortAccountCount = shortItems.stream()
                .map(LongShortList.ListItem::getAccountName)
                .filter(a -> a != null)
                .distinct().count();
        long shortClusterCount = shortItems.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 2)
                .count();
        long shortSubClusterCount = shortItems.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 3)
                .count();

        // Able 과제 등록 단계 (Short List → Able) 통계
        List<AbleTask> ableTasks = ableTaskRepository.findByProjectId(projectId);
        long ableAccountCount = ableTasks.stream()
                .flatMap(t -> t.getMajorAccounts() != null ? t.getMajorAccounts().stream() : java.util.stream.Stream.empty())
                .filter(a -> a != null && !a.isEmpty())
                .distinct().count();
        long ableClusterCount = ableTasks.stream()
                .flatMap(t -> t.getClusters() != null ? t.getClusters().stream() : java.util.stream.Stream.empty())
                .map(AbleTask.ClusterRef::getClusterName)
                .filter(c -> c != null && !c.isEmpty())
                .distinct().count();
        double ableTotalAmount = ableTasks.stream()
                .mapToDouble(t -> t.getBaseAmount() != null ? t.getBaseAmount() : 0.0)
                .sum();

        return ShortListStatsResponse.builder()
                .longListItemCount(longLevel2.size())
                .shortListItemCount(shortLevel2.size())
                .totalAmount(longListTotal)
                .shortListTotalAmount(shortListTotal)
                .selectionRatio(Math.round(selectionRatio * 100.0) / 100.0)
                .longListAccountCount((int) longAccountCount)
                .longListClusterCount((int) longClusterCount)
                .longListSubClusterCount((int) longSubClusterCount)
                .shortListAccountCount((int) shortAccountCount)
                .shortListClusterCount((int) shortClusterCount)
                .shortListSubClusterCount((int) shortSubClusterCount)
                .ableRegisterAccountCount((int) ableAccountCount)
                .ableRegisterClusterCount((int) ableClusterCount)
                .ableRegisterTotalAmount(ableTotalAmount)
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
                .orElse(null);

        if (list == null || list.getLongListItems() == null) {
            return ChartDataResponse.builder()
                    .supplierBreakdown(Collections.emptyList())
                    .costCenterBreakdown(Collections.emptyList())
                    .build();
        }

        List<LongShortList.ListItem> longListItems = list.getLongListItems();

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
                .orElse(null);

        if (list == null || list.getLongListItems() == null) {
            return ItemStatsResponse.builder().build();
        }

        List<LongShortList.ListItem> longListItems = list.getLongListItems();

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
                .orElse(null);

        if (list == null) {
            return new LongListTreeResponse(Collections.emptyList());
        }

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
                // 세부 클러스터가 있으면 선택된 것들의 합산으로 금액/건수 재계산
                if (!subItems.isEmpty()) {
                    double recalcAmount = subItems.stream()
                            .mapToDouble(s -> s.getTotalAmount() != null ? s.getTotalAmount() : 0.0).sum();
                    int recalcCount = subItems.stream()
                            .mapToInt(s -> s.getTotalCount() != null ? s.getTotalCount() : 0).sum();
                    node.setTotalAmount(recalcAmount);
                    node.setTotalCount(recalcCount);
                }
                node.setChildren(new ArrayList<>(subChildren));
                return node;
            }).toList();

            int totalCount = clusterNodes.stream().mapToInt(n -> n.getTotalCount() != null ? n.getTotalCount() : 0).sum();
            double totalAmount = clusterNodes.stream().mapToDouble(n -> n.getTotalAmount() != null ? n.getTotalAmount() : 0.0).sum();
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

    /**
     * Level 2 항목의 합산 금액을 계산하되, Level 3 세부 클러스터가 존재하는 경우
     * Level 2 원본 금액 대신 선택된 Level 3 합산으로 재계산
     */
    private double recalculateLevel2Total(List<LongShortList.ListItem> items) {
        if (items == null || items.isEmpty()) return 0.0;

        // Level 3 항목을 부모 키 기준 그룹핑
        Map<String, Double> level3SumByParent = items.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 3)
                .collect(Collectors.groupingBy(
                        i -> i.getSessionId() + ":" + i.getParentClusterNumber(),
                        Collectors.summingDouble(i -> i.getTotalAmount() != null ? i.getTotalAmount() : 0.0)
                ));

        return items.stream()
                .filter(i -> i.getLevel() != null && i.getLevel() == 2)
                .mapToDouble(l2 -> {
                    String parentKey = l2.getSessionId() + ":" + l2.getClusterNumber();
                    Double subTotal = level3SumByParent.get(parentKey);
                    // Level 3 자식이 있으면 그 합산 사용, 없으면 Level 2 원본 사용
                    return subTotal != null ? subTotal : (l2.getTotalAmount() != null ? l2.getTotalAmount() : 0.0);
                })
                .sum();
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

    /**
     * 클러스터 통계 ID 기반 Raw Data 페이징 조회
     *
     * session_data.stats_l2_id / stats_l3_id 기반 직접 페이징 조회
     */
    public RawDataPageResponse getRawData(String statisticsId, int page, int size) {
        ClusterStatistics stats = clusterStatisticsRepository.findById(statisticsId)
                .orElseThrow(() -> new RuntimeException("통계 데이터를 찾을 수 없습니다: " + statisticsId));

        Pageable pageable = PageRequest.of(page, size, Sort.by("rowNumber").ascending());
        Page<SessionDataDocument> dataPage;

        if (stats.getLevel() == 3) {
            dataPage = sessionDataRepository.findByStatsL3Id(statisticsId, pageable);
        } else if (stats.getLevel() == 2) {
            dataPage = sessionDataRepository.findByStatsL2Id(statisticsId, pageable);
        } else {
            return RawDataPageResponse.builder()
                    .columns(Collections.emptyList()).rows(Collections.emptyList())
                    .page(page).size(size).totalCount(0).totalPages(0).build();
        }

        return buildRawDataResponse(dataPage, page, size);
    }

    /**
     * 계정명(Account) 수준 Raw Data 페이징 조회
     *
     * 계정명에 소속된 모든 Level 2 cluster_statistics ID를 수집 후
     * session_data.stats_l2_id IN (ids) 으로 직접 페이징 조회
     */
    public RawDataPageResponse getAccountRawData(String projectId, String accountName, int page, int size) {
        LongShortList list = longShortListRepository.findFirstByProjectId(projectId)
                .orElse(null);

        List<LongShortList.ListItem> longListItems = list != null ? list.getLongListItems() : null;
        if (longListItems == null) {
            return RawDataPageResponse.builder()
                    .columns(Collections.emptyList()).rows(Collections.emptyList())
                    .page(page).size(size).totalCount(0).totalPages(0).build();
        }

        List<String> l2StatsIds = longListItems.stream()
                .filter(i -> accountName.equals(i.getAccountName()) && i.getLevel() != null && i.getLevel() == 2)
                .map(LongShortList.ListItem::getStatisticsId)
                .filter(Objects::nonNull)
                .toList();

        if (l2StatsIds.isEmpty()) {
            return RawDataPageResponse.builder()
                    .columns(Collections.emptyList()).rows(Collections.emptyList())
                    .page(page).size(size).totalCount(0).totalPages(0).build();
        }

        Pageable pageable = PageRequest.of(page, size, Sort.by("rowNumber").ascending());
        Page<SessionDataDocument> dataPage = sessionDataRepository.findByStatsL2IdIn(l2StatsIds, pageable);
        return buildRawDataResponse(dataPage, page, size);
    }

    /**
     * Page<SessionDataDocument> → RawDataPageResponse 변환
     */
    private RawDataPageResponse buildRawDataResponse(Page<SessionDataDocument> dataPage, int page, int size) {
        List<String> columns = new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();

        for (SessionDataDocument doc : dataPage.getContent()) {
            if (doc.getData() != null) {
                if (columns.isEmpty()) columns.addAll(doc.getData().keySet());
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("_rowNumber", doc.getRowNumber());
                row.putAll(doc.getData());
                rows.add(row);
            }
        }

        return RawDataPageResponse.builder()
                .columns(columns).rows(rows)
                .page(page).size(size)
                .totalCount(dataPage.getTotalElements())
                .totalPages(dataPage.getTotalPages())
                .build();
    }
}
