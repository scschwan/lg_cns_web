package com.example.finance.service.data;

import com.example.finance.model.data.ClusterStatistics;
import com.example.finance.model.data.ClusterStatistics.BreakdownItem;
import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.session.FileSession;
import com.example.finance.repository.data.ClusterStatisticsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 클러스터 통계 서비스
 *
 * 세션 완료 시 clustering_results + process_view_data 기반으로
 * 병합 클러스터별 코스트센터/공급업체 집계 통계를 생성한다.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ClusterStatisticsService {

    private final MongoTemplate mongoTemplate;
    private final ClusterStatisticsRepository clusterStatisticsRepository;

    /**
     * 세션의 클러스터 통계 생성
     *
     * 기존 통계를 삭제하고 새로 생성한다.
     * 계층 구조:
     *   Level 1: 세션 전체 (계정명 기준)
     *   Level 2: 병합 클러스터 (parent) / 독립 클러스터
     *   Level 3: 세부 클러스터 (sub-merge parent)
     */
    public void generateStatistics(String sessionId, String projectId) {
        log.info("클러스터 통계 생성 시작: sessionId={}, projectId={}", sessionId, projectId);

        // 기존 통계 삭제
        clusterStatisticsRepository.deleteBySessionId(sessionId);

        // 세션 정보 조회 (계정명)
        FileSession session = mongoTemplate.findOne(
                new Query(Criteria.where("session_id").is(sessionId)),
                FileSession.class);
        if (session == null) {
            log.warn("세션을 찾을 수 없음: sessionId={}", sessionId);
            return;
        }

        // projectId가 파라미터로 전달되지 않은 경우 세션에서 가져옴
        String resolvedProjectId = (projectId != null && !projectId.isBlank())
                ? projectId
                : session.getProjectId();

        String accountName = (session.getAccountNames() != null && !session.getAccountNames().isEmpty())
                ? String.join(", ", session.getAccountNames())
                : "-";

        // 전체 클러스터 조회
        List<ClusteringResult> allClusters = mongoTemplate.find(
                new Query(Criteria.where("session_id").is(sessionId)),
                ClusteringResult.class);

        if (allClusters.isEmpty()) {
            log.info("클러스터가 없음: sessionId={}", sessionId);
            return;
        }

        // ★ 성능 최적화: process_view_data를 1회만 조회하여 raw_data_id별 Map 구성
        Map<String, DocData> processViewDataMap = loadProcessViewData(sessionId);
        log.info("process_view_data 로드 완료: {} rows", processViewDataMap.size());

        // 최상위 클러스터 분류: 독립(-1) + 병합 부모(clusterId==clusterNumber)
        List<ClusteringResult> topLevelClusters = allClusters.stream()
                .filter(c -> {
                    boolean isIndependent = c.getClusterId() == null || c.getClusterId() == -1;
                    boolean isMergeParent = c.getClusterId() != null && c.getClusterId() > 0
                            && c.getClusterId().equals(c.getClusterNumber());
                    return isIndependent || isMergeParent;
                })
                .collect(Collectors.toList());

        // 세부 클러스터 부모 분류: clusterSubId == clusterNumber
        List<ClusteringResult> subMergeParents = allClusters.stream()
                .filter(c -> c.getClusterSubId() != null && c.getClusterSubId() > 0
                        && c.getClusterSubId().equals(c.getClusterNumber()))
                .collect(Collectors.toList());

        List<ClusterStatistics> statisticsList = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        // ── Level 2: 최상위 클러스터별 통계 ──
        List<String> allDataIndicesForSession = new ArrayList<>();

        for (ClusteringResult cluster : topLevelClusters) {
            List<String> dataIndices = cluster.getDataIndices();
            if (dataIndices == null || dataIndices.isEmpty()) continue;

            allDataIndicesForSession.addAll(dataIndices);

            AggregationResult aggResult = aggregateFromMap(processViewDataMap, dataIndices);

            statisticsList.add(ClusterStatistics.builder()
                    .projectId(resolvedProjectId)
                    .sessionId(sessionId)
                    .clusterNumber(cluster.getClusterNumber())
                    .parentClusterNumber(null)
                    .clusterName(cluster.getClusterName())
                    .accountName(accountName)
                    .level(2)
                    .totalCount(cluster.getCount())
                    .totalAmount(cluster.getTotalAmount())
                    .costCenterCount(aggResult.costCenters.size())
                    .supplierCount(aggResult.suppliers.size())
                    .costCenterBreakdown(aggResult.costCenters)
                    .supplierBreakdown(aggResult.suppliers)
                    .createdAt(now)
                    .build());
        }

        // ── Level 3: 세부 클러스터별 통계 ──
        for (ClusteringResult subParent : subMergeParents) {
            List<String> dataIndices = subParent.getDataIndices();
            if (dataIndices == null || dataIndices.isEmpty()) continue;

            // 상위 클러스터 번호 찾기 (clusterId가 상위 병합 클러스터 번호)
            Integer parentNumber = subParent.getClusterId();

            AggregationResult aggResult = aggregateFromMap(processViewDataMap, dataIndices);

            statisticsList.add(ClusterStatistics.builder()
                    .projectId(resolvedProjectId)
                    .sessionId(sessionId)
                    .clusterNumber(subParent.getClusterNumber())
                    .parentClusterNumber(parentNumber)
                    .clusterName(subParent.getClusterName())
                    .accountName(accountName)
                    .level(3)
                    .totalCount(subParent.getCount())
                    .totalAmount(subParent.getTotalAmount())
                    .costCenterCount(aggResult.costCenters.size())
                    .supplierCount(aggResult.suppliers.size())
                    .costCenterBreakdown(aggResult.costCenters)
                    .supplierBreakdown(aggResult.suppliers)
                    .createdAt(now)
                    .build());
        }

        // ── Level 3 추가: 세부클러스터링이 있지만 미분류된 항목 '기타' 처리 ──
        Set<Integer> clusterIdsWithSubClustering = subMergeParents.stream()
                .map(ClusteringResult::getClusterId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        for (ClusteringResult topCluster : topLevelClusters) {
            Integer parentClusterNum = topCluster.getClusterNumber();
            if (parentClusterNum == null) continue;

            // 이 최상위 클러스터에 세부클러스터링이 존재하는지 확인
            if (!clusterIdsWithSubClustering.contains(parentClusterNum)) {
                continue;
            }

            // 미세부클러스터링 항목: cluster_id == parentClusterNum, 부모 자신 제외, cluster_sub_id == -1 or null
            List<ClusteringResult> unSubClustered = allClusters.stream()
                    .filter(c -> c.getClusterId() != null && c.getClusterId().equals(parentClusterNum)
                            && !c.getClusterNumber().equals(parentClusterNum)
                            && (c.getClusterSubId() == null || c.getClusterSubId() == -1))
                    .collect(Collectors.toList());

            if (unSubClustered.isEmpty()) {
                continue;
            }

            List<String> etcDataIndices = new ArrayList<>();
            int etcTotalCount = 0;
            double etcTotalAmount = 0.0;
            for (ClusteringResult c : unSubClustered) {
                if (c.getDataIndices() != null) {
                    etcDataIndices.addAll(c.getDataIndices());
                }
                etcTotalCount += c.getCount() != null ? c.getCount() : 0;
                etcTotalAmount += c.getTotalAmount() != null ? c.getTotalAmount() : 0.0;
            }

            AggregationResult aggResult = !etcDataIndices.isEmpty()
                    ? aggregateFromMap(processViewDataMap, etcDataIndices)
                    : new AggregationResult();

            statisticsList.add(ClusterStatistics.builder()
                    .projectId(resolvedProjectId)
                    .sessionId(sessionId)
                    .clusterNumber(null)
                    .parentClusterNumber(parentClusterNum)
                    .clusterName("기타")
                    .accountName(accountName)
                    .level(3)
                    .totalCount(etcTotalCount)
                    .totalAmount(etcTotalAmount)
                    .costCenterCount(aggResult.costCenters.size())
                    .supplierCount(aggResult.suppliers.size())
                    .costCenterBreakdown(aggResult.costCenters)
                    .supplierBreakdown(aggResult.suppliers)
                    .createdAt(now)
                    .build());
        }

        // ── Level 1: 세션 전체 통계 ──
        if (!allDataIndicesForSession.isEmpty()) {
            AggregationResult sessionAgg = aggregateFromMap(processViewDataMap, allDataIndicesForSession);

            int totalCount = topLevelClusters.stream()
                    .mapToInt(c -> c.getCount() != null ? c.getCount() : 0)
                    .sum();
            double totalAmount = topLevelClusters.stream()
                    .mapToDouble(c -> c.getTotalAmount() != null ? c.getTotalAmount() : 0.0)
                    .sum();

            statisticsList.add(ClusterStatistics.builder()
                    .projectId(resolvedProjectId)
                    .sessionId(sessionId)
                    .clusterNumber(null)
                    .parentClusterNumber(null)
                    .clusterName(null)
                    .accountName(accountName)
                    .level(1)
                    .totalCount(totalCount)
                    .totalAmount(totalAmount)
                    .costCenterCount(sessionAgg.costCenters.size())
                    .supplierCount(sessionAgg.suppliers.size())
                    .costCenterBreakdown(sessionAgg.costCenters)
                    .supplierBreakdown(sessionAgg.suppliers)
                    .createdAt(now)
                    .build());
        }

        // 일괄 저장
        if (!statisticsList.isEmpty()) {
            clusterStatisticsRepository.saveAll(statisticsList);
        }

        log.info("클러스터 통계 생성 완료: sessionId={}, level1={}, level2={}, level3={}",
                sessionId,
                statisticsList.stream().filter(s -> s.getLevel() == 1).count(),
                statisticsList.stream().filter(s -> s.getLevel() == 2).count(),
                statisticsList.stream().filter(s -> s.getLevel() == 3).count());
    }

    /**
     * 세션의 process_view_data를 1회 조회하여 raw_data_id → DocData Map으로 반환
     */
    private Map<String, DocData> loadProcessViewData(String sessionId) {
        List<Document> docs = mongoTemplate.getCollection("process_view_data")
                .find(new Document("session_id", sessionId))
                .projection(new Document("raw_data_id", 1).append("department", 1)
                        .append("supplier", 1).append("money", 1))
                .into(new ArrayList<>());

        Map<String, DocData> map = new HashMap<>(docs.size());
        for (Document doc : docs) {
            String rawDataId = doc.getString("raw_data_id");
            if (rawDataId != null) {
                String dept = doc.getString("department");
                String sup = doc.getString("supplier");
                double money = toDouble(doc.get("money"));
                map.put(rawDataId, new DocData(dept, sup, money));
            }
        }
        return map;
    }

    /**
     * 메모리 Map에서 지정된 rawDataIds에 해당하는 항목을 집계
     */
    private AggregationResult aggregateFromMap(Map<String, DocData> dataMap, List<String> rawDataIds) {
        AggregationResult aggResult = new AggregationResult();

        Map<String, long[]> ccMap = new LinkedHashMap<>();
        Map<String, long[]> supMap = new LinkedHashMap<>();

        for (String rawDataId : rawDataIds) {
            DocData data = dataMap.get(rawDataId);
            if (data == null) continue;

            String dept = (data.department == null || data.department.isBlank()) ? "(미지정)" : data.department;
            ccMap.computeIfAbsent(dept, k -> new long[2]);
            ccMap.get(dept)[0]++;
            ccMap.get(dept)[1] += Math.round(data.money);

            String sup = (data.supplier == null || data.supplier.isBlank()) ? "(미지정)" : data.supplier;
            supMap.computeIfAbsent(sup, k -> new long[2]);
            supMap.get(sup)[0]++;
            supMap.get(sup)[1] += Math.round(data.money);
        }

        // 코스트센터 결과 변환 (금액 내림차순)
        ccMap.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue()[1], a.getValue()[1]))
                .forEach(e -> aggResult.costCenters.add(BreakdownItem.builder()
                        .name(e.getKey())
                        .count((int) e.getValue()[0])
                        .totalAmount((double) e.getValue()[1])
                        .build()));

        // 공급업체 결과 변환 (금액 내림차순)
        supMap.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue()[1], a.getValue()[1]))
                .forEach(e -> aggResult.suppliers.add(BreakdownItem.builder()
                        .name(e.getKey())
                        .count((int) e.getValue()[0])
                        .totalAmount((double) e.getValue()[1])
                        .build()));

        return aggResult;
    }

    private double toDouble(Object value) {
        if (value == null) return 0.0;
        if (value instanceof Number) return ((Number) value).doubleValue();
        try {
            return Double.parseDouble(value.toString());
        } catch (NumberFormatException e) {
            return 0.0;
        }
    }

    /**
     * 세션 완료 상태 취소
     *
     * clustering_results 또는 process_view_data에 CUD 발생 시 호출.
     * is_completed를 false로, export_path/completed_at을 초기화한다.
     */
    public void cancelSessionCompletionIfNeeded(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId));
        FileSession session = mongoTemplate.findOne(query, FileSession.class);

        if (session != null && Boolean.TRUE.equals(session.getIsCompleted())) {
            Update update = new Update()
                    .set("is_completed", false)
                    .unset("export_path")
                    .unset("completed_at")
                    .set("updated_at", LocalDateTime.now());
            mongoTemplate.updateFirst(query, update, FileSession.class);
            log.info("세션 완료 상태 자동 취소: sessionId={}", sessionId);

            // 기존 통계도 삭제
            clusterStatisticsRepository.deleteBySessionId(sessionId);
        }
    }

    private static class AggregationResult {
        List<BreakdownItem> costCenters = new ArrayList<>();
        List<BreakdownItem> suppliers = new ArrayList<>();
    }

    private static class DocData {
        final String department;
        final String supplier;
        final double money;

        DocData(String department, String supplier, double money) {
            this.department = department;
            this.supplier = supplier;
            this.money = money;
        }
    }
}
