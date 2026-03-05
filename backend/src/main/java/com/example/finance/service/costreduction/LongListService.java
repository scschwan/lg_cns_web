package com.example.finance.service.costreduction;

import com.example.finance.dto.request.costreduction.SaveListRequest;
import com.example.finance.dto.response.costreduction.*;
import com.example.finance.model.costreduction.LongShortList;
import com.example.finance.model.data.ClusterStatistics;
import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.data.SessionDataDocument;
import com.example.finance.model.session.FileSession;
import com.example.finance.repository.costreduction.LongShortListRepository;
import com.example.finance.repository.data.ClusterStatisticsRepository;
import com.example.finance.repository.data.ClusteringResultRepository;
import com.example.finance.repository.data.SessionDataRepository;
import com.example.finance.repository.session.FileSessionRepository;
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
public class LongListService {

    private final ClusterStatisticsRepository clusterStatisticsRepository;
    private final ClusteringResultRepository clusteringResultRepository;
    private final SessionDataRepository sessionDataRepository;
    private final LongShortListRepository longShortListRepository;
    private final FileSessionRepository fileSessionRepository;
    private final RedisService redisService;
    private final ObjectMapper objectMapper;

    private static final Duration CACHE_TTL = Duration.ofMinutes(30);

    /**
     * 트리 데이터 조회 (계정명 → 클러스터 → 세부클러스터)
     */
    public LongListTreeResponse getTreeData(String projectId) {
        // Redis 캐시 확인
        String cacheKey = "longlist:tree:" + projectId;
        Object cached = redisService.get(cacheKey);
        if (cached != null) {
            try {
                List<TreeNode> tree = objectMapper.convertValue(cached, new TypeReference<>() {});
                return new LongListTreeResponse(tree);
            } catch (Exception e) {
                log.warn("Failed to deserialize cached tree data, fetching fresh data", e);
            }
        }

        // cluster_statistics에서 Level 2, 3 데이터 조회
        List<ClusterStatistics> allStats = findStatsByProject(projectId);
        List<ClusterStatistics> level2Stats = allStats.stream()
                .filter(s -> s.getLevel() == 2).toList();
        List<ClusterStatistics> level3Stats = allStats.stream()
                .filter(s -> s.getLevel() == 3).toList();

        // account_name 기준 그룹핑 (세션 통합)
        Map<String, List<ClusterStatistics>> level2ByAccount = level2Stats.stream()
                .collect(Collectors.groupingBy(ClusterStatistics::getAccountName));

        // Level 3을 sessionId + parentClusterNumber 기준으로 그룹핑
        Map<String, Map<Integer, List<ClusterStatistics>>> level3BySessionAndParent = level3Stats.stream()
                .collect(Collectors.groupingBy(
                        ClusterStatistics::getSessionId,
                        Collectors.groupingBy(ClusterStatistics::getParentClusterNumber)
                ));

        // 트리 구조 변환
        List<TreeNode> tree = new ArrayList<>();

        for (Map.Entry<String, List<ClusterStatistics>> entry : level2ByAccount.entrySet()) {
            String accountName = entry.getKey();
            List<ClusterStatistics> clusters = entry.getValue();

            // 중분류 → 소분류 트리 구성
            List<TreeNode> clusterNodes = clusters.stream().map(l2 -> {
                // 해당 클러스터의 Level 3 항목
                List<ClusterStatistics> subClusters = level3BySessionAndParent
                        .getOrDefault(l2.getSessionId(), Collections.emptyMap())
                        .getOrDefault(l2.getClusterNumber(), Collections.emptyList());

                List<TreeNode> subChildren = subClusters.stream()
                        .map(this::toTreeNode)
                        .toList();

                TreeNode node = toTreeNode(l2);
                node.setChildren(new ArrayList<>(subChildren));
                return node;
            }).toList();

            // 대분류 노드 (합산 통계)
            int totalCount = clusters.stream().mapToInt(c -> c.getTotalCount() != null ? c.getTotalCount() : 0).sum();
            double totalAmount = clusters.stream().mapToDouble(c -> c.getTotalAmount() != null ? c.getTotalAmount() : 0.0).sum();
            int supplierCount = clusters.stream().mapToInt(c -> c.getSupplierCount() != null ? c.getSupplierCount() : 0).sum();
            int costCenterCount = clusters.stream().mapToInt(c -> c.getCostCenterCount() != null ? c.getCostCenterCount() : 0).sum();

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

        // Redis 캐시 저장
        try {
            redisService.set(cacheKey, tree, CACHE_TTL);
        } catch (Exception e) {
            log.warn("Failed to cache tree data", e);
        }

        return new LongListTreeResponse(tree);
    }

    /**
     * 전체 요약 통계
     */
    public LongListStatsResponse getStats(String projectId) {
        List<ClusterStatistics> allStats = findStatsByProject(projectId);

        List<ClusterStatistics> level1Stats = allStats.stream()
                .filter(s -> s.getLevel() == 1).toList();
        List<ClusterStatistics> level2Stats = allStats.stream()
                .filter(s -> s.getLevel() == 2).toList();
        List<ClusterStatistics> level3Stats = allStats.stream()
                .filter(s -> s.getLevel() == 3).toList();

        long rawDataRows = level1Stats.stream()
                .mapToLong(s -> s.getTotalCount() != null ? s.getTotalCount() : 0)
                .sum();
        double totalAmount = level1Stats.stream()
                .mapToDouble(s -> s.getTotalAmount() != null ? s.getTotalAmount() : 0.0)
                .sum();

        Set<String> accountNames = level2Stats.stream()
                .map(ClusterStatistics::getAccountName)
                .collect(Collectors.toSet());

        return LongListStatsResponse.builder()
                .rawDataRows(rawDataRows)
                .accountCount(accountNames.size())
                .mainClusterCount(level2Stats.size())
                .subClusterCount(level3Stats.size())
                .totalAmount(totalAmount)
                .build();
    }

    /**
     * 차트 데이터 조회 (공급업체/코스트센터 breakdown)
     */
    public ChartDataResponse getChartData(String statisticsId, Integer top) {
        String cacheKey = "longlist:chart:" + statisticsId + ":" + top;
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
     * 선택 항목의 상세 카드 데이터
     */
    public ItemStatsResponse getItemStats(String projectId, String statisticsId) {
        ClusterStatistics stats = clusterStatisticsRepository.findById(statisticsId)
                .orElseThrow(() -> new RuntimeException("통계 데이터를 찾을 수 없습니다: " + statisticsId));

        // 전체 프로젝트 금액 (비율 계산용)
        List<ClusterStatistics> level1Stats = findStatsByProject(projectId).stream()
                .filter(s -> s.getLevel() == 1).toList();
        double projectTotal = level1Stats.stream()
                .mapToDouble(s -> s.getTotalAmount() != null ? s.getTotalAmount() : 0.0)
                .sum();

        double ratio = projectTotal > 0
                ? (stats.getTotalAmount() != null ? stats.getTotalAmount() : 0.0) / projectTotal * 100
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
        List<ClusterStatistics> allStats = findStatsByProject(projectId);
        List<ClusterStatistics> level2Stats = allStats.stream()
                .filter(s -> s.getLevel() == 2 && accountName.equals(s.getAccountName()))
                .toList();

        Map<String, ChartDataResponse.BreakdownItemDto> supplierMap = new LinkedHashMap<>();
        Map<String, ChartDataResponse.BreakdownItemDto> costCenterMap = new LinkedHashMap<>();

        for (ClusterStatistics stats : level2Stats) {
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
        List<ClusterStatistics> allStats = findStatsByProject(projectId);
        List<ClusterStatistics> level2Stats = allStats.stream()
                .filter(s -> s.getLevel() == 2 && accountName.equals(s.getAccountName()))
                .toList();

        int rawDataRows = level2Stats.stream().mapToInt(s -> s.getTotalCount() != null ? s.getTotalCount() : 0).sum();
        int supplierCount = level2Stats.stream().mapToInt(s -> s.getSupplierCount() != null ? s.getSupplierCount() : 0).sum();
        int costCenterCount = level2Stats.stream().mapToInt(s -> s.getCostCenterCount() != null ? s.getCostCenterCount() : 0).sum();
        double totalAmount = level2Stats.stream().mapToDouble(s -> s.getTotalAmount() != null ? s.getTotalAmount() : 0.0).sum();

        // Level 1 전체 금액 대비 비율
        double projectTotal = allStats.stream()
                .filter(s -> s.getLevel() == 1)
                .mapToDouble(s -> s.getTotalAmount() != null ? s.getTotalAmount() : 0.0)
                .sum();
        double ratio = projectTotal > 0 ? totalAmount / projectTotal * 100 : 0.0;

        return ItemStatsResponse.builder()
                .rawDataRows(rawDataRows)
                .supplierCount(supplierCount)
                .costCenterCount(costCenterCount)
                .totalAmount(totalAmount)
                .ratioToTotal(Math.round(ratio * 100.0) / 100.0)
                .build();
    }

    /**
     * 체크된 항목 저장
     */
    public int saveSelections(String projectId, SaveListRequest request) {
        LongShortList list = longShortListRepository.findFirstByProjectId(projectId)
                .orElseGet(() -> LongShortList.builder()
                        .projectId(projectId)
                        .createdAt(LocalDateTime.now())
                        .build());

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

        list.setLongListItems(items);
        // Short List 항목 초기화 (Long List 재저장 시 기존 Short List는 무효)
        list.setShortListItems(new ArrayList<>());
        list.setUpdatedAt(LocalDateTime.now());
        longShortListRepository.save(list);

        // Short List 관련 캐시 무효화
        redisService.delete("shortlist:tree:" + projectId);

        return items.size();
    }

    /**
     * statisticsId 목록만으로 Long List 저장 (DB에서 전체 데이터 조회)
     * - 프론트엔드에서 ID 목록만 보내므로 요청 body가 작음 (WAF 제한 우회)
     */
    public int saveSelectionsByIds(String projectId, List<String> statisticsIds) {
        if (statisticsIds == null || statisticsIds.isEmpty()) {
            return 0;
        }

        // DB에서 ClusterStatistics 일괄 조회
        List<ClusterStatistics> statsList = clusterStatisticsRepository.findAllById(statisticsIds);

        List<LongShortList.ListItem> items = statsList.stream()
                .map(stats -> LongShortList.ListItem.builder()
                        .statisticsId(stats.getId())
                        .sessionId(stats.getSessionId())
                        .accountName(stats.getAccountName())
                        .clusterNumber(stats.getClusterNumber())
                        .clusterName(stats.getClusterName())
                        .level(stats.getLevel())
                        .parentClusterNumber(stats.getParentClusterNumber())
                        .totalAmount(stats.getTotalAmount())
                        .totalCount(stats.getTotalCount())
                        .build())
                .toList();

        LongShortList list = longShortListRepository.findFirstByProjectId(projectId)
                .orElseGet(() -> LongShortList.builder()
                        .projectId(projectId)
                        .createdAt(LocalDateTime.now())
                        .build());

        list.setLongListItems(items);
        list.setShortListItems(new ArrayList<>());
        list.setUpdatedAt(LocalDateTime.now());
        longShortListRepository.save(list);

        redisService.delete("shortlist:tree:" + projectId);

        log.info("Saved {} long list items by IDs for project {}", items.size(), projectId);
        return items.size();
    }

    /**
     * 저장된 선택 항목 조회
     */
    public List<SaveListRequest.ListItemDto> getSelections(String projectId) {
        return longShortListRepository.findFirstByProjectId(projectId)
                .map(list -> {
                    List<LongShortList.ListItem> items = list.getLongListItems();
                    if (items == null) return Collections.<SaveListRequest.ListItemDto>emptyList();
                    return items.stream()
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

    private TreeNode toTreeNode(ClusterStatistics stats) {
        return TreeNode.builder()
                .id(stats.getId())
                .statisticsId(stats.getId())
                .sessionId(stats.getSessionId())
                .accountName(stats.getAccountName())
                .clusterNumber(stats.getClusterNumber())
                .clusterName(stats.getClusterName())
                .level(stats.getLevel())
                .parentClusterNumber(stats.getParentClusterNumber())
                .totalCount(stats.getTotalCount())
                .totalAmount(stats.getTotalAmount())
                .supplierCount(stats.getSupplierCount())
                .costCenterCount(stats.getCostCenterCount())
                .children(new ArrayList<>())
                .build();
    }

    /**
     * projectId로 cluster_statistics 조회.
     * project_id가 없는 기존 데이터는 sessionId 기반으로 fallback 조회 후 project_id를 backfill.
     */
    private List<ClusterStatistics> findStatsByProject(String projectId) {
        List<ClusterStatistics> stats = clusterStatisticsRepository.findByProjectId(projectId);
        if (!stats.isEmpty()) {
            return stats;
        }

        // fallback: 프로젝트의 완료된 세션들로 조회
        List<FileSession> sessions = fileSessionRepository.findByProjectIdAndIsDeletedFalse(projectId);
        List<String> completedSessionIds = sessions.stream()
                .filter(s -> Boolean.TRUE.equals(s.getIsCompleted()))
                .map(FileSession::getSessionId)
                .toList();

        if (completedSessionIds.isEmpty()) {
            return Collections.emptyList();
        }

        List<ClusterStatistics> allStats = new ArrayList<>();
        for (String sessionId : completedSessionIds) {
            allStats.addAll(clusterStatisticsRepository.findBySessionId(sessionId));
        }

        // project_id backfill
        if (!allStats.isEmpty()) {
            log.info("Backfilling project_id for {} cluster_statistics records, projectId={}",
                    allStats.size(), projectId);
            for (ClusterStatistics s : allStats) {
                s.setProjectId(projectId);
            }
            clusterStatisticsRepository.saveAll(allStats);
        }

        return allStats;
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

        // Top N
        for (int i = 0; i < top; i++) {
            ClusterStatistics.BreakdownItem item = items.get(i);
            result.add(ChartDataResponse.BreakdownItemDto.builder()
                    .name(item.getName())
                    .count(item.getCount())
                    .totalAmount(item.getTotalAmount())
                    .build());
        }

        // 나머지 "기타" 합산
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
     */
    public RawDataPageResponse getRawData(String statisticsId, int page, int size) {
        ClusterStatistics stats = clusterStatisticsRepository.findById(statisticsId)
                .orElseThrow(() -> new RuntimeException("통계 데이터를 찾을 수 없습니다: " + statisticsId));

        List<String> dataIndices = collectDataIndices(stats);
        return fetchRawDataPage(dataIndices, page, size);
    }

    /**
     * 계정명(Account) 수준 Raw Data 페이징 조회
     */
    public RawDataPageResponse getAccountRawData(String projectId, String accountName, int page, int size) {
        List<ClusterStatistics> allStats = findStatsByProject(projectId);
        List<ClusterStatistics> level2Stats = allStats.stream()
                .filter(s -> s.getLevel() == 2 && accountName.equals(s.getAccountName()))
                .toList();

        List<String> allDataIndices = new ArrayList<>();
        for (ClusterStatistics stats : level2Stats) {
            allDataIndices.addAll(collectDataIndices(stats));
        }

        return fetchRawDataPage(allDataIndices, page, size);
    }

    /**
     * ClusterStatistics에서 해당하는 ClusteringResult의 dataIndices를 수집
     */
    private List<String> collectDataIndices(ClusterStatistics stats) {
        String sessionId = stats.getSessionId();
        Integer clusterNumber = stats.getClusterNumber();

        if (sessionId == null || clusterNumber == null) {
            return Collections.emptyList();
        }

        List<String> dataIndices = new ArrayList<>();

        if (stats.getLevel() == 3) {
            // Level 3: 단일 클러스터의 dataIndices
            clusteringResultRepository.findFirstBySessionIdAndClusterNumber(sessionId, clusterNumber)
                    .ifPresent(cr -> dataIndices.addAll(cr.getDataIndices()));
        } else if (stats.getLevel() == 2) {
            // Level 2: 병합된 하위 클러스터들 + 독립 클러스터
            // 1) 하위 클러스터 (clusterId == clusterNumber)
            List<ClusteringResult> children = clusteringResultRepository
                    .findBySessionIdAndClusterIdOrderByClusterNumberAsc(sessionId, clusterNumber);
            if (!children.isEmpty()) {
                for (ClusteringResult child : children) {
                    if (child.getDataIndices() != null) {
                        dataIndices.addAll(child.getDataIndices());
                    }
                }
            } else {
                // 2) 독립 클러스터 (children이 없으면 자기 자신)
                clusteringResultRepository.findFirstBySessionIdAndClusterNumber(sessionId, clusterNumber)
                        .ifPresent(cr -> {
                            if (cr.getDataIndices() != null) {
                                dataIndices.addAll(cr.getDataIndices());
                            }
                        });
            }
        }

        return dataIndices;
    }

    /**
     * dataIndices(raw_data_id 목록)로 SessionDataDocument 페이징 조회
     */
    private RawDataPageResponse fetchRawDataPage(List<String> dataIndices, int page, int size) {
        if (dataIndices.isEmpty()) {
            return RawDataPageResponse.builder()
                    .columns(Collections.emptyList())
                    .rows(Collections.emptyList())
                    .page(page)
                    .size(size)
                    .totalCount(0)
                    .totalPages(0)
                    .build();
        }

        Pageable pageable = PageRequest.of(page, size, Sort.by("rowNumber").ascending());
        Page<SessionDataDocument> dataPage = sessionDataRepository.findByRawDataIdIn(dataIndices, pageable);

        // 컬럼 헤더 추출 (첫 번째 행의 data 키에서)
        List<String> columns = new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();

        for (SessionDataDocument doc : dataPage.getContent()) {
            if (doc.getData() != null) {
                if (columns.isEmpty()) {
                    columns.addAll(doc.getData().keySet());
                }
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("_rowNumber", doc.getRowNumber());
                row.putAll(doc.getData());
                rows.add(row);
            }
        }

        return RawDataPageResponse.builder()
                .columns(columns)
                .rows(rows)
                .page(page)
                .size(size)
                .totalCount(dataPage.getTotalElements())
                .totalPages(dataPage.getTotalPages())
                .build();
    }
}
