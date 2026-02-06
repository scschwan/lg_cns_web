package com.example.finance.service.data;

import com.example.finance.exception.BusinessException;
import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.data.ColumnMappingDocument;
import com.example.finance.model.data.SearchKeywordHierarchy;
import com.example.finance.repository.data.ClusteringResultRepository;
import com.example.finance.repository.data.SearchKeywordHierarchyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 세부 클러스터링 서비스 (Step 7)
 * ClusteringService와 동일한 로직이지만 cluster_sub_id 기준으로 동작.
 * 모든 쿼리는 cluster_id = clusterId 조건으로 스코핑됨.
 * cluster_id 값은 절대 수정하지 않음.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DetailClusteringService {

    private final MongoTemplate mongoTemplate;
    private final ClusteringResultRepository clusteringResultRepository;
    private final SearchKeywordHierarchyRepository keywordHierarchyRepository;

    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(
            Math.max(2, Runtime.getRuntime().availableProcessors()));

    // ============================================================
    // 1. 미세부병합 클러스터 조회 (페이징 + 대표 데이터)
    // ============================================================

    public Map<String, Object> getUnmergedClusters(
            String sessionId, int clusterId, int page, int size, String keyword) {

        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(clusterId)
                .and("cluster_sub_id").is(-1);

        Set<Integer> subMergedParentNumbers = getSubMergedParentNumbers(sessionId, clusterId);
        if (!subMergedParentNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").nin(subMergedParentNumbers);
        }

        if (keyword != null && !keyword.isBlank()) {
            criteria = criteria.and("keywords").is(keyword);
        }

        Criteria finalCriteria = criteria;
        CompletableFuture<Long> countFuture = CompletableFuture.supplyAsync(
                () -> mongoTemplate.count(new Query(finalCriteria), ClusteringResult.class), EXECUTOR);
        CompletableFuture<List<String>> colFuture = CompletableFuture.supplyAsync(
                () -> getVisibleColumns(sessionId), EXECUTOR);

        Query query = new Query(criteria)
                .with(Sort.by("cluster_number"))
                .skip((long) page * size)
                .limit(size);
        List<ClusteringResult> clusters = mongoTemplate.find(query, ClusteringResult.class);

        Set<String> firstRawIds = new LinkedHashSet<>();
        for (ClusteringResult c : clusters) {
            if (c.getDataIndices() != null && !c.getDataIndices().isEmpty()) {
                firstRawIds.add(c.getDataIndices().get(0));
            }
        }
        Map<String, Map<String, Object>> rawIdToData = batchFetchSessionData(sessionId, firstRawIds);

        long totalCount;
        List<String> visibleColumns;
        try {
            totalCount = countFuture.get(10, TimeUnit.SECONDS);
            visibleColumns = colFuture.get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("병렬 조회 실패, 동기 조회로 fallback", e);
            totalCount = mongoTemplate.count(new Query(finalCriteria), ClusteringResult.class);
            visibleColumns = getVisibleColumns(sessionId);
        }

        List<Map<String, Object>> dataWithRepresentative = new ArrayList<>();
        for (ClusteringResult c : clusters) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("clusterNumber", c.getClusterNumber());
            row.put("clusterName", c.getClusterName());
            row.put("keywords", c.getKeywords());
            row.put("count", c.getCount());
            row.put("totalAmount", c.getTotalAmount());
            row.put("supplier", c.getSupplier());
            row.put("department", c.getDepartment());

            if (c.getDataIndices() != null && !c.getDataIndices().isEmpty()) {
                Map<String, Object> repData = rawIdToData.get(c.getDataIndices().get(0));
                if (repData != null) {
                    row.put("representativeData", repData);
                }
            }
            dataWithRepresentative.add(row);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("data", dataWithRepresentative);
        result.put("columns", visibleColumns);
        result.put("totalCount", totalCount);
        result.put("page", page);
        result.put("size", size);
        result.put("totalPages", (int) Math.ceil((double) totalCount / size));
        return result;
    }

    // ============================================================
    // 2. 키워드 통계 (cluster_id = clusterId 스코핑)
    // ============================================================

    public List<Map<String, Object>> getKeywordStats(String sessionId, int clusterId) {
        List<ClusteringResult> unmerged = getActiveUnmergedClusters(sessionId, clusterId);

        ConcurrentHashMap<String, long[]> kwStats = new ConcurrentHashMap<>();
        unmerged.parallelStream().forEach(c -> {
            for (String kw : c.getKeywords()) {
                kwStats.compute(kw, (k, v) -> {
                    if (v == null) v = new long[]{0, 0};
                    v[0] += c.getCount();
                    v[1] += (long) (c.getTotalAmount() * 100);
                    return v;
                });
            }
        });

        List<Map.Entry<String, long[]>> sorted = new ArrayList<>(kwStats.entrySet());
        sorted.sort((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]));

        List<Map<String, Object>> result = new ArrayList<>();
        int rank = 1;
        for (Map.Entry<String, long[]> entry : sorted) {
            Map<String, Object> stat = new LinkedHashMap<>();
            stat.put("rank", rank++);
            stat.put("keyword", entry.getKey());
            stat.put("count", entry.getValue()[0]);
            stat.put("totalAmount", entry.getValue()[1] / 100.0);
            result.add(stat);
        }
        return result;
    }

    // ============================================================
    // 3. 공급업체 통계
    // ============================================================

    public List<Map<String, Object>> getSupplierStats(String sessionId, int clusterId) {
        List<ClusteringResult> unmerged = getActiveUnmergedClusters(sessionId, clusterId);

        ConcurrentHashMap<String, long[]> supStats = new ConcurrentHashMap<>();
        unmerged.parallelStream().forEach(c -> {
            String sup = c.getSupplier();
            if (sup == null || sup.isBlank()) sup = "(미지정)";
            String finalSup = sup;
            supStats.compute(finalSup, (k, v) -> {
                if (v == null) v = new long[]{0, 0};
                v[0] += c.getCount();
                v[1] += (long) (c.getTotalAmount() * 100);
                return v;
            });
        });

        List<Map.Entry<String, long[]>> sorted = new ArrayList<>(supStats.entrySet());
        sorted.sort((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]));

        List<Map<String, Object>> result = new ArrayList<>();
        int rank = 1;
        for (Map.Entry<String, long[]> entry : sorted) {
            Map<String, Object> stat = new LinkedHashMap<>();
            stat.put("rank", rank++);
            stat.put("supplier", entry.getKey());
            stat.put("count", entry.getValue()[0]);
            stat.put("totalAmount", entry.getValue()[1] / 100.0);
            result.add(stat);
        }
        return result;
    }

    public boolean hasSupplierClustering(String sessionId, int clusterId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(clusterId)
                .and("supplier").ne(null))
                .limit(1);
        return mongoTemplate.exists(query, ClusteringResult.class);
    }

    // ============================================================
    // 4. 세부 병합 클러스터 목록
    // ============================================================

    public List<Map<String, Object>> getMergedClusters(String sessionId, int clusterId) {
        List<ClusteringResult> all = getAllClustersInScope(sessionId, clusterId);

        Set<Integer> subMergedClusterNumbers = all.stream()
                .filter(c -> c.getClusterSubId() > 0)
                .map(ClusteringResult::getClusterSubId)
                .collect(Collectors.toSet());

        Set<String> allFirstRawIds = new LinkedHashSet<>();
        for (ClusteringResult c : all) {
            if (c.getDataIndices() != null && !c.getDataIndices().isEmpty()) {
                allFirstRawIds.add(c.getDataIndices().get(0));
            }
        }
        Map<String, Map<String, Object>> rawIdToData = batchFetchSessionData(sessionId, allFirstRawIds);
        List<String> visibleColumns = getVisibleColumns(sessionId);

        List<Map<String, Object>> result = new ArrayList<>();
        for (ClusteringResult cluster : all) {
            if (subMergedClusterNumbers.contains(cluster.getClusterNumber())) {
                List<ClusteringResult> children = all.stream()
                        .filter(c -> c.getClusterSubId().equals(cluster.getClusterNumber()))
                        .collect(Collectors.toList());

                Map<String, Object> merged = new LinkedHashMap<>();
                merged.put("clusterNumber", cluster.getClusterNumber());
                merged.put("clusterName", cluster.getClusterName());
                merged.put("keywords", cluster.getKeywords());
                merged.put("count", cluster.getCount());
                merged.put("totalAmount", cluster.getTotalAmount());
                merged.put("childCount", children.size());
                merged.put("columns", visibleColumns);

                List<Map<String, Object>> childList = children.stream()
                        .map(c -> {
                            Map<String, Object> child = new LinkedHashMap<>();
                            child.put("clusterNumber", c.getClusterNumber());
                            child.put("clusterName", c.getClusterName());
                            child.put("keywords", c.getKeywords());
                            child.put("count", c.getCount());
                            child.put("totalAmount", c.getTotalAmount());
                            child.put("supplier", c.getSupplier());
                            child.put("department", c.getDepartment());
                            if (c.getDataIndices() != null && !c.getDataIndices().isEmpty()) {
                                Map<String, Object> repData = rawIdToData.get(c.getDataIndices().get(0));
                                if (repData != null) child.put("representativeData", repData);
                            }
                            return child;
                        })
                        .collect(Collectors.toList());
                merged.put("children", childList);
                result.add(merged);
            }
        }
        return result;
    }

    // ============================================================
    // 5. 통계
    // ============================================================

    public Map<String, Object> getStatistics(String sessionId, int clusterId) {
        List<ClusteringResult> all = getAllClustersInScope(sessionId, clusterId);

        Set<Integer> subMergedParents = all.stream()
                .filter(c -> c.getClusterSubId() > 0)
                .map(ClusteringResult::getClusterSubId)
                .collect(Collectors.toSet());

        List<ClusteringResult> unmerged = all.stream()
                .filter(c -> c.getClusterSubId() == -1)
                .collect(Collectors.toList());

        long totalRows = unmerged.stream().mapToLong(ClusteringResult::getCount).sum();

        long pureUnmergedCount = unmerged.stream()
                .filter(c -> !subMergedParents.contains(c.getClusterNumber()))
                .count();
        double pureUnmergedAmount = unmerged.stream()
                .filter(c -> !subMergedParents.contains(c.getClusterNumber()))
                .mapToDouble(ClusteringResult::getTotalAmount)
                .sum();

        boolean hasSupplier = hasSupplierClustering(sessionId, clusterId);

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalRows", totalRows);
        stats.put("totalClusters", all.size());
        stats.put("unmergedCount", pureUnmergedCount);
        stats.put("unmergedTotalAmount", pureUnmergedAmount);
        stats.put("mergedGroupCount", subMergedParents.size());
        stats.put("hasSupplier", hasSupplier);
        return stats;
    }

    // ============================================================
    // 6. 세부 병합 (cluster_sub_id 설정, cluster_id 절대 수정 안함)
    // ============================================================

    public Map<String, Object> mergeClusters(String sessionId, int clusterId, List<Integer> clusterNumbers) {
        log.info("세부 클러스터 병합: sessionId={}, clusterId={}, clusterNumbers={}", sessionId, clusterId, clusterNumbers);

        if (clusterNumbers == null || clusterNumbers.size() < 2) {
            throw new BusinessException("MERGE_MIN_COUNT", "세부 병합하려면 2개 이상의 클러스터를 선택해야 합니다.");
        }

        List<ClusteringResult> targets = clusteringResultRepository
                .findBySessionIdAndClusterNumberIn(sessionId, clusterNumbers);

        // clusterId 스코프 검증
        targets = targets.stream()
                .filter(c -> c.getClusterId().equals(clusterId))
                .collect(Collectors.toList());

        if (targets.size() != clusterNumbers.size()) {
            throw new BusinessException("CLUSTER_NOT_FOUND", "일부 클러스터를 찾을 수 없습니다.");
        }

        for (ClusteringResult target : targets) {
            if (target.getClusterSubId() > 0) {
                throw new BusinessException("ALREADY_MERGED",
                        "클러스터 #" + target.getClusterNumber() + "은(는) 이미 다른 세부 병합 클러스터에 속해 있습니다.");
            }
        }

        int newClusterNumber = getNextClusterNumber(sessionId);

        Set<String> allKeywords = new LinkedHashSet<>();
        List<String> allDataIndices = new ArrayList<>();
        int totalCount = 0;
        double totalAmount = 0;

        for (ClusteringResult target : targets) {
            allKeywords.addAll(target.getKeywords());
            allDataIndices.addAll(target.getDataIndices());
            totalCount += target.getCount();
            totalAmount += target.getTotalAmount();
        }

        String mergedName = String.join("_", allKeywords);

        // 세부 병합 부모 생성 (cluster_id = clusterId 유지!)
        ClusteringResult merged = ClusteringResult.builder()
                .sessionId(sessionId)
                .clusterNumber(newClusterNumber)
                .clusterId(clusterId)       // cluster_id 유지
                .clusterSubId(-1)           // 부모이므로 -1
                .clusterName(mergedName)
                .keywords(new ArrayList<>(allKeywords))
                .count(totalCount)
                .totalAmount(totalAmount)
                .dataIndices(allDataIndices)
                .createdAt(LocalDateTime.now())
                .build();

        clusteringResultRepository.save(merged);

        // 자식들의 cluster_sub_id만 변경 (cluster_id 절대 수정 안함!)
        targets.parallelStream().forEach(target -> target.setClusterSubId(newClusterNumber));
        clusteringResultRepository.saveAll(targets);

        log.info("세부 클러스터 병합 완료: #{}, {}개 합침", newClusterNumber, targets.size());

        Map<String, Object> result = new HashMap<>();
        result.put("mergedClusterNumber", newClusterNumber);
        result.put("mergedClusterName", mergedName);
        result.put("mergedCount", targets.size());
        result.put("totalCount", totalCount);
        result.put("totalAmount", totalAmount);
        return result;
    }

    // ============================================================
    // 7. 세부 병합 해제 (전체)
    // ============================================================

    public Map<String, Object> unmergeClusters(String sessionId, int clusterId, Integer mergedClusterNumber) {
        log.info("세부 병합 해제: sessionId={}, clusterId={}, mergedClusterNumber={}", sessionId, clusterId, mergedClusterNumber);

        ClusteringResult merged = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, mergedClusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                        "세부 병합 클러스터를 찾을 수 없습니다: #" + mergedClusterNumber));

        // cluster_sub_id로 자식 찾기
        Query childQuery = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(clusterId)
                .and("cluster_sub_id").is(mergedClusterNumber));
        List<ClusteringResult> children = mongoTemplate.find(childQuery, ClusteringResult.class);

        if (children.isEmpty()) {
            throw new BusinessException("NO_CHILDREN", "하위 클러스터가 없습니다.");
        }

        // cluster_sub_id만 -1로 복원 (cluster_id 절대 수정 안함!)
        children.parallelStream().forEach(child -> child.setClusterSubId(-1));
        clusteringResultRepository.saveAll(children);
        clusteringResultRepository.delete(merged);

        log.info("세부 병합 해제 완료: {}개 복원", children.size());

        Map<String, Object> result = new HashMap<>();
        result.put("restoredCount", children.size());
        result.put("deletedClusterNumber", mergedClusterNumber);
        return result;
    }

    // ============================================================
    // 8. 부분 세부 병합 해제
    // ============================================================

    public Map<String, Object> unmergePartialClusters(
            String sessionId, int clusterId, Integer mergedClusterNumber, List<Integer> childClusterNumbers) {

        log.info("부분 세부 병합 해제: sessionId={}, clusterId={}, merged={}, children={}",
                sessionId, clusterId, mergedClusterNumber, childClusterNumbers);

        ClusteringResult merged = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, mergedClusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                        "세부 병합 클러스터를 찾을 수 없습니다: #" + mergedClusterNumber));

        Query childQuery = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(clusterId)
                .and("cluster_sub_id").is(mergedClusterNumber));
        List<ClusteringResult> allChildren = mongoTemplate.find(childQuery, ClusteringResult.class);

        List<ClusteringResult> toRemove = allChildren.stream()
                .filter(c -> childClusterNumbers.contains(c.getClusterNumber()))
                .collect(Collectors.toList());

        if (toRemove.isEmpty()) {
            throw new BusinessException("NO_CHILDREN", "해제할 하위 클러스터가 없습니다.");
        }

        // cluster_sub_id만 -1로 복원
        toRemove.parallelStream().forEach(child -> child.setClusterSubId(-1));
        clusteringResultRepository.saveAll(toRemove);

        List<ClusteringResult> remaining = allChildren.stream()
                .filter(c -> !childClusterNumbers.contains(c.getClusterNumber()))
                .collect(Collectors.toList());

        if (remaining.isEmpty()) {
            clusteringResultRepository.delete(merged);
        } else {
            Set<String> allKeywords = new LinkedHashSet<>();
            List<String> allDataIndices = new ArrayList<>();
            int totalCount = 0;
            double totalAmount = 0;
            for (ClusteringResult child : remaining) {
                allKeywords.addAll(child.getKeywords());
                allDataIndices.addAll(child.getDataIndices());
                totalCount += child.getCount();
                totalAmount += child.getTotalAmount();
            }
            merged.setKeywords(new ArrayList<>(allKeywords));
            merged.setClusterName(String.join("_", allKeywords));
            merged.setCount(totalCount);
            merged.setTotalAmount(totalAmount);
            merged.setDataIndices(allDataIndices);
            clusteringResultRepository.save(merged);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("removedCount", toRemove.size());
        result.put("remainingCount", remaining.size());
        result.put("parentDeleted", remaining.isEmpty());
        return result;
    }

    // ============================================================
    // 9. 세부 병합 클러스터끼리 병합
    // ============================================================

    public Map<String, Object> mergeMergedClusters(String sessionId, int clusterId, List<Integer> mergedClusterNumbers) {
        log.info("세부 병합 클러스터 merge: sessionId={}, clusterId={}, targets={}", sessionId, clusterId, mergedClusterNumbers);

        if (mergedClusterNumbers == null || mergedClusterNumbers.size() < 2) {
            throw new BusinessException("MERGE_MIN_COUNT", "2개 이상의 세부 병합 클러스터를 선택해야 합니다.");
        }

        List<ClusteringResult> all = getAllClustersInScope(sessionId, clusterId);

        List<ClusteringResult> targetParents = all.stream()
                .filter(c -> mergedClusterNumbers.contains(c.getClusterNumber()))
                .collect(Collectors.toList());

        if (targetParents.size() != mergedClusterNumbers.size()) {
            throw new BusinessException("CLUSTER_NOT_FOUND", "일부 세부 병합 클러스터를 찾을 수 없습니다.");
        }

        // cluster_sub_id로 자식 수집
        List<ClusteringResult> allChildrenToMove = all.stream()
                .filter(c -> mergedClusterNumbers.contains(c.getClusterSubId()))
                .collect(Collectors.toList());

        int newClusterNumber = getNextClusterNumber(sessionId);
        Set<String> allKeywords = new LinkedHashSet<>();
        List<String> allDataIndices = new ArrayList<>();
        int totalCount = 0;
        double totalAmount = 0;

        for (ClusteringResult child : allChildrenToMove) {
            allKeywords.addAll(child.getKeywords());
            allDataIndices.addAll(child.getDataIndices());
            totalCount += child.getCount();
            totalAmount += child.getTotalAmount();
        }

        String mergedName = String.join("_", allKeywords);

        ClusteringResult newParent = ClusteringResult.builder()
                .sessionId(sessionId)
                .clusterNumber(newClusterNumber)
                .clusterId(clusterId)       // cluster_id 유지!
                .clusterSubId(-1)
                .clusterName(mergedName)
                .keywords(new ArrayList<>(allKeywords))
                .count(totalCount)
                .totalAmount(totalAmount)
                .dataIndices(allDataIndices)
                .createdAt(LocalDateTime.now())
                .build();

        clusteringResultRepository.save(newParent);

        // cluster_sub_id만 변경
        allChildrenToMove.parallelStream().forEach(child -> child.setClusterSubId(newClusterNumber));
        clusteringResultRepository.saveAll(allChildrenToMove);

        clusteringResultRepository.deleteAll(targetParents);

        log.info("세부 병합 클러스터 merge 완료: #{}, {}개 자식", newClusterNumber, allChildrenToMove.size());

        Map<String, Object> result = new HashMap<>();
        result.put("mergedClusterNumber", newClusterNumber);
        result.put("mergedClusterName", mergedName);
        result.put("childCount", allChildrenToMove.size());
        result.put("deletedParentCount", targetParents.size());
        return result;
    }

    // ============================================================
    // 10. 추가 세부 병합
    // ============================================================

    public Map<String, Object> addToMergedCluster(
            String sessionId, int clusterId, Integer targetMergedClusterNumber, List<Integer> clusterNumbers) {

        log.info("추가 세부 병합: sessionId={}, clusterId={}, target={}, additions={}",
                sessionId, clusterId, targetMergedClusterNumber, clusterNumbers);

        ClusteringResult parent = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, targetMergedClusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                        "대상 세부 병합 클러스터를 찾을 수 없습니다: #" + targetMergedClusterNumber));

        List<ClusteringResult> targets = clusteringResultRepository
                .findBySessionIdAndClusterNumberIn(sessionId, clusterNumbers);
        targets = targets.stream()
                .filter(c -> c.getClusterId().equals(clusterId))
                .collect(Collectors.toList());

        if (targets.isEmpty()) {
            throw new BusinessException("CLUSTER_NOT_FOUND", "추가할 클러스터를 찾을 수 없습니다.");
        }

        // cluster_sub_id만 변경
        for (ClusteringResult target : targets) {
            target.setClusterSubId(targetMergedClusterNumber);
        }
        clusteringResultRepository.saveAll(targets);

        // 부모 재계산
        Query childQuery = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(clusterId)
                .and("cluster_sub_id").is(targetMergedClusterNumber));
        List<ClusteringResult> allChildren = mongoTemplate.find(childQuery, ClusteringResult.class);

        Set<String> allKeywords = new LinkedHashSet<>();
        List<String> allDataIndices = new ArrayList<>();
        int totalCount = 0;
        double totalAmount = 0;
        for (ClusteringResult child : allChildren) {
            allKeywords.addAll(child.getKeywords());
            allDataIndices.addAll(child.getDataIndices());
            totalCount += child.getCount();
            totalAmount += child.getTotalAmount();
        }

        parent.setKeywords(new ArrayList<>(allKeywords));
        parent.setClusterName(String.join("_", allKeywords));
        parent.setCount(totalCount);
        parent.setTotalAmount(totalAmount);
        parent.setDataIndices(allDataIndices);
        clusteringResultRepository.save(parent);

        Map<String, Object> result = new HashMap<>();
        result.put("addedCount", targets.size());
        result.put("totalChildCount", allChildren.size());
        result.put("mergedClusterNumber", targetMergedClusterNumber);
        return result;
    }

    // ============================================================
    // 11. 클러스터명 수정
    // ============================================================

    public void updateClusterName(String sessionId, Integer clusterNumber, String newName) {
        ClusteringResult cluster = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, clusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                        "클러스터를 찾을 수 없습니다: #" + clusterNumber));
        cluster.setClusterName(newName);
        clusteringResultRepository.save(cluster);
    }

    // ============================================================
    // 12. 전체 미세부병합 클러스터 번호 조회
    // ============================================================

    public List<Integer> getAllUnmergedClusterNumbers(String sessionId, int clusterId, String keyword) {
        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(clusterId)
                .and("cluster_sub_id").is(-1);

        Set<Integer> subMergedParentNumbers = getSubMergedParentNumbers(sessionId, clusterId);
        if (!subMergedParentNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").nin(subMergedParentNumbers);
        }

        if (keyword != null && !keyword.isBlank()) {
            criteria = criteria.and("keywords").is(keyword);
        }

        Query query = new Query(criteria);
        query.fields().include("cluster_number");

        return mongoTemplate.find(query, ClusteringResult.class).stream()
                .map(ClusteringResult::getClusterNumber)
                .collect(Collectors.toList());
    }

    // ============================================================
    // 13. 고급 검색
    // ============================================================

    public Map<String, Object> advancedSearch(
            String sessionId, int clusterId, int page, int size,
            String searchColumn, String searchValue, boolean exactMatch,
            String excludeValue, boolean excludeExactMatch,
            List<Integer> withinClusterNumbers) {

        log.info("세부 클러스터 고급 검색: sessionId={}, clusterId={}, column={}, value={}",
                sessionId, clusterId, searchColumn, searchValue);

        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(clusterId)
                .and("cluster_sub_id").is(-1);

        Set<Integer> subMergedParentNumbers = getSubMergedParentNumbers(sessionId, clusterId);

        if (withinClusterNumbers != null && !withinClusterNumbers.isEmpty()) {
            Set<Integer> filteredIds = new HashSet<>(withinClusterNumbers);
            filteredIds.removeAll(subMergedParentNumbers);
            criteria = criteria.and("cluster_number").in(filteredIds);
        } else if (!subMergedParentNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").nin(subMergedParentNumbers);
        }

        List<Criteria> additionalCriteria = new ArrayList<>();
        if (searchValue != null && !searchValue.isBlank()) {
            additionalCriteria.add(buildSearchCriteria(searchColumn, searchValue, exactMatch));
        }
        if (excludeValue != null && !excludeValue.isBlank()) {
            additionalCriteria.add(buildExcludeCriteria(searchColumn, excludeValue, excludeExactMatch));
        }
        if (!additionalCriteria.isEmpty()) {
            additionalCriteria.add(0, criteria);
            criteria = new Criteria().andOperator(additionalCriteria.toArray(new Criteria[0]));
        }

        Criteria finalCriteria = criteria;
        CompletableFuture<Long> countFuture = CompletableFuture.supplyAsync(
                () -> mongoTemplate.count(new Query(finalCriteria), ClusteringResult.class), EXECUTOR);
        CompletableFuture<List<String>> colFuture = CompletableFuture.supplyAsync(
                () -> getVisibleColumns(sessionId), EXECUTOR);

        Query query = new Query(criteria)
                .with(Sort.by("cluster_number"))
                .skip((long) page * size)
                .limit(size);
        List<ClusteringResult> clusters = mongoTemplate.find(query, ClusteringResult.class);

        Set<String> firstRawIds = new LinkedHashSet<>();
        for (ClusteringResult c : clusters) {
            if (c.getDataIndices() != null && !c.getDataIndices().isEmpty()) {
                firstRawIds.add(c.getDataIndices().get(0));
            }
        }
        Map<String, Map<String, Object>> rawIdToData = batchFetchSessionData(sessionId, firstRawIds);

        long totalCount;
        List<String> visibleColumns;
        try {
            totalCount = countFuture.get(10, TimeUnit.SECONDS);
            visibleColumns = colFuture.get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("병렬 조회 실패, 동기 조회로 fallback", e);
            totalCount = mongoTemplate.count(new Query(finalCriteria), ClusteringResult.class);
            visibleColumns = getVisibleColumns(sessionId);
        }

        List<Map<String, Object>> dataWithRepresentative = new ArrayList<>();
        for (ClusteringResult c : clusters) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("clusterNumber", c.getClusterNumber());
            row.put("clusterName", c.getClusterName());
            row.put("keywords", c.getKeywords());
            row.put("count", c.getCount());
            row.put("totalAmount", c.getTotalAmount());
            row.put("supplier", c.getSupplier());
            row.put("department", c.getDepartment());
            if (c.getDataIndices() != null && !c.getDataIndices().isEmpty()) {
                Map<String, Object> repData = rawIdToData.get(c.getDataIndices().get(0));
                if (repData != null) row.put("representativeData", repData);
            }
            dataWithRepresentative.add(row);
        }

        List<Integer> allResultClusterNumbers = null;
        if (totalCount <= 10000) {
            Query allIdsQuery = new Query(finalCriteria);
            allIdsQuery.fields().include("cluster_number");
            allResultClusterNumbers = mongoTemplate.find(allIdsQuery, ClusteringResult.class).stream()
                    .map(ClusteringResult::getClusterNumber)
                    .collect(Collectors.toList());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("data", dataWithRepresentative);
        result.put("columns", visibleColumns);
        result.put("totalCount", totalCount);
        result.put("page", page);
        result.put("size", size);
        result.put("totalPages", (int) Math.ceil((double) totalCount / size));
        result.put("resultClusterNumbers", allResultClusterNumbers);
        return result;
    }

    public List<Integer> getAdvancedSearchClusterNumbers(
            String sessionId, int clusterId,
            String searchColumn, String searchValue, boolean exactMatch,
            String excludeValue, boolean excludeExactMatch,
            List<Integer> withinClusterNumbers) {

        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(clusterId)
                .and("cluster_sub_id").is(-1);

        Set<Integer> subMergedParentNumbers = getSubMergedParentNumbers(sessionId, clusterId);

        if (withinClusterNumbers != null && !withinClusterNumbers.isEmpty()) {
            Set<Integer> filteredIds = new HashSet<>(withinClusterNumbers);
            filteredIds.removeAll(subMergedParentNumbers);
            criteria = criteria.and("cluster_number").in(filteredIds);
        } else if (!subMergedParentNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").nin(subMergedParentNumbers);
        }

        List<Criteria> additionalCriteria = new ArrayList<>();
        if (searchValue != null && !searchValue.isBlank()) {
            additionalCriteria.add(buildSearchCriteria(searchColumn, searchValue, exactMatch));
        }
        if (excludeValue != null && !excludeValue.isBlank()) {
            additionalCriteria.add(buildExcludeCriteria(searchColumn, excludeValue, excludeExactMatch));
        }
        if (!additionalCriteria.isEmpty()) {
            additionalCriteria.add(0, criteria);
            criteria = new Criteria().andOperator(additionalCriteria.toArray(new Criteria[0]));
        }

        Query query = new Query(criteria);
        query.fields().include("cluster_number");

        return mongoTemplate.find(query, ClusteringResult.class).stream()
                .map(ClusteringResult::getClusterNumber)
                .collect(Collectors.toList());
    }

    public List<Map<String, String>> getSearchableColumns(String sessionId, int clusterId) {
        List<Map<String, String>> columns = new ArrayList<>();

        Query sessionQuery = new Query(Criteria.where("session_id").is(sessionId));
        Document sessionDoc = mongoTemplate.findOne(sessionQuery, Document.class, "file_sessions");

        String supplierColumnName = sessionDoc != null ? sessionDoc.getString("supplier_column") : null;
        String costCenterColumnName = sessionDoc != null ? sessionDoc.getString("cost_center_column") : null;
        String targetColumnName = sessionDoc != null ? sessionDoc.getString("target_column") : null;

        columns.add(Map.of("key", "keyword", "label", "키워드"));
        columns.add(Map.of("key", "clusterName", "label", "클러스터명"));

        if (targetColumnName != null && !targetColumnName.isBlank()) {
            columns.add(Map.of("key", "target", "label", targetColumnName));
        }

        if (hasSupplierClustering(sessionId, clusterId)) {
            String label = (supplierColumnName != null && !supplierColumnName.isBlank())
                    ? supplierColumnName : "공급업체";
            columns.add(Map.of("key", "supplier", "label", label));
        }

        Query deptQuery = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(clusterId)
                .and("department").ne(null)).limit(1);
        if (mongoTemplate.exists(deptQuery, ClusteringResult.class)) {
            String label = (costCenterColumnName != null && !costCenterColumnName.isBlank())
                    ? costCenterColumnName : "코스트센터";
            columns.add(Map.of("key", "department", "label", label));
        }

        return columns;
    }

    // ============================================================
    // 14. 키워드 계층 CRUD (Lv1/Lv2/Lv3)
    // ============================================================

    public List<Map<String, Object>> getKeywordHierarchy(String sessionId) {
        List<SearchKeywordHierarchy> all = keywordHierarchyRepository
                .findBySessionIdOrderByLevelAscDisplayOrderAsc(sessionId);

        Map<String, List<SearchKeywordHierarchy>> byParent = all.stream()
                .filter(k -> k.getParentId() != null)
                .collect(Collectors.groupingBy(SearchKeywordHierarchy::getParentId));

        Map<Integer, List<SearchKeywordHierarchy>> byLevel = all.stream()
                .collect(Collectors.groupingBy(SearchKeywordHierarchy::getLevel));

        List<Map<String, Object>> result = new ArrayList<>();
        List<SearchKeywordHierarchy> lv1List = byLevel.getOrDefault(1, Collections.emptyList());
        for (SearchKeywordHierarchy lv1 : lv1List) {
            result.add(buildKeywordNode(lv1, byParent));
        }
        return result;
    }

    private Map<String, Object> buildKeywordNode(SearchKeywordHierarchy kw,
                                                  Map<String, List<SearchKeywordHierarchy>> byParent) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", kw.getId());
        node.put("keyword", kw.getKeyword());
        node.put("level", kw.getLevel());
        node.put("displayOrder", kw.getDisplayOrder());

        List<SearchKeywordHierarchy> children = byParent.getOrDefault(kw.getId(), Collections.emptyList());
        if (!children.isEmpty()) {
            List<Map<String, Object>> childNodes = children.stream()
                    .map(c -> buildKeywordNode(c, byParent))
                    .collect(Collectors.toList());
            node.put("children", childNodes);
        } else {
            node.put("children", Collections.emptyList());
        }
        return node;
    }

    public Map<String, Object> addKeywordHierarchy(String sessionId, Integer level, String parentId, String keyword) {
        if (level < 1 || level > 3) {
            throw new BusinessException("INVALID_LEVEL", "레벨은 1, 2, 3 중 하나여야 합니다.");
        }
        if (level > 1 && (parentId == null || parentId.isBlank())) {
            throw new BusinessException("PARENT_REQUIRED", "Lv2, Lv3는 상위 키워드 ID가 필요합니다.");
        }
        if (keyword == null || keyword.isBlank()) {
            throw new BusinessException("KEYWORD_REQUIRED", "키워드는 필수입니다.");
        }

        int maxOrder = keywordHierarchyRepository
                .findBySessionIdAndLevelOrderByDisplayOrderAsc(sessionId, level)
                .stream()
                .mapToInt(SearchKeywordHierarchy::getDisplayOrder)
                .max()
                .orElse(0);

        SearchKeywordHierarchy newKw = SearchKeywordHierarchy.builder()
                .sessionId(sessionId)
                .level(level)
                .parentId(level > 1 ? parentId : null)
                .keyword(keyword)
                .displayOrder(maxOrder + 1)
                .createdAt(LocalDateTime.now())
                .build();

        keywordHierarchyRepository.save(newKw);

        Map<String, Object> result = new HashMap<>();
        result.put("id", newKw.getId());
        result.put("keyword", newKw.getKeyword());
        result.put("level", newKw.getLevel());
        result.put("parentId", newKw.getParentId());
        result.put("displayOrder", newKw.getDisplayOrder());
        return result;
    }

    public Map<String, Object> updateKeywordHierarchy(String id, String keyword) {
        SearchKeywordHierarchy kw = keywordHierarchyRepository.findById(id)
                .orElseThrow(() -> new BusinessException("KEYWORD_NOT_FOUND", "키워드를 찾을 수 없습니다."));
        kw.setKeyword(keyword);
        keywordHierarchyRepository.save(kw);

        Map<String, Object> result = new HashMap<>();
        result.put("id", kw.getId());
        result.put("keyword", kw.getKeyword());
        result.put("level", kw.getLevel());
        return result;
    }

    public Map<String, Object> deleteKeywordHierarchy(String sessionId, String id) {
        SearchKeywordHierarchy kw = keywordHierarchyRepository.findById(id)
                .orElseThrow(() -> new BusinessException("KEYWORD_NOT_FOUND", "키워드를 찾을 수 없습니다."));

        int deletedCount = 1;
        deletedCount += deleteChildKeywords(sessionId, id);
        keywordHierarchyRepository.delete(kw);

        Map<String, Object> result = new HashMap<>();
        result.put("deletedId", id);
        result.put("deletedCount", deletedCount);
        return result;
    }

    private int deleteChildKeywords(String sessionId, String parentId) {
        List<SearchKeywordHierarchy> children = keywordHierarchyRepository
                .findBySessionIdAndParentIdOrderByDisplayOrderAsc(sessionId, parentId);
        int count = 0;
        for (SearchKeywordHierarchy child : children) {
            count += deleteChildKeywords(sessionId, child.getId());
            keywordHierarchyRepository.delete(child);
            count++;
        }
        return count;
    }

    // ============================================================
    // 내부 헬퍼 메서드
    // ============================================================

    private int getNextClusterNumber(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId))
                .with(Sort.by(Sort.Direction.DESC, "cluster_number"))
                .limit(1);
        ClusteringResult last = mongoTemplate.findOne(query, ClusteringResult.class);
        return (last != null && last.getClusterNumber() != null) ? last.getClusterNumber() + 1 : 1;
    }

    /** 스코프 내 모든 클러스터 (cluster_id = clusterId) */
    private List<ClusteringResult> getAllClustersInScope(String sessionId, int clusterId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(clusterId))
                .with(Sort.by("cluster_number"));
        return mongoTemplate.find(query, ClusteringResult.class);
    }

    /** 스코프 내 활성(미세부병합) 클러스터 */
    private List<ClusteringResult> getActiveUnmergedClusters(String sessionId, int clusterId) {
        List<ClusteringResult> all = getAllClustersInScope(sessionId, clusterId);

        Set<Integer> subMergedParents = all.stream()
                .filter(c -> c.getClusterSubId() > 0)
                .map(ClusteringResult::getClusterSubId)
                .collect(Collectors.toSet());

        return all.stream()
                .filter(c -> c.getClusterSubId() == -1 && !subMergedParents.contains(c.getClusterNumber()))
                .collect(Collectors.toList());
    }

    /** 세부 병합 부모 번호 집합 */
    private Set<Integer> getSubMergedParentNumbers(String sessionId, int clusterId) {
        List<ClusteringResult> all = getAllClustersInScope(sessionId, clusterId);
        return all.stream()
                .filter(c -> c.getClusterSubId() > 0)
                .map(ClusteringResult::getClusterSubId)
                .collect(Collectors.toSet());
    }

    private List<String> getVisibleColumns(String sessionId) {
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("is_visible").is(true))
                .with(Sort.by("sequence"));
        return mongoTemplate.find(query, ColumnMappingDocument.class).stream()
                .map(ColumnMappingDocument::getOriginalName)
                .collect(Collectors.toList());
    }

    private Map<String, Map<String, Object>> batchFetchSessionData(
            String sessionId, Set<String> rawDataIds) {
        if (rawDataIds.isEmpty()) return Collections.emptyMap();

        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("raw_data_id").in(rawDataIds));
        query.fields().include("raw_data_id").include("data");

        List<Document> docs = mongoTemplate.find(query, Document.class, "session_data");

        Map<String, Map<String, Object>> result = new HashMap<>();
        for (Document doc : docs) {
            String rawId = doc.getString("raw_data_id");
            Object dataObj = doc.get("data");
            if (rawId != null && dataObj instanceof Document) {
                @SuppressWarnings("unchecked")
                Map<String, Object> data = new LinkedHashMap<>((Document) dataObj);
                result.put(rawId, data);
            }
        }
        return result;
    }

    private Criteria buildSearchCriteria(String column, String value, boolean exact) {
        if (column == null || column.isBlank()) column = "keyword";
        String fieldName = getFieldNameForColumn(column);
        if (exact) {
            return Criteria.where(fieldName).is(value);
        } else {
            return Criteria.where(fieldName).regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
        }
    }

    private Criteria buildExcludeCriteria(String column, String value, boolean exact) {
        if (column == null || column.isBlank()) column = "keyword";
        String fieldName = getFieldNameForColumn(column);
        if (exact) {
            return Criteria.where(fieldName).ne(value);
        } else {
            return Criteria.where(fieldName).not().regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
        }
    }

    private String getFieldNameForColumn(String column) {
        switch (column.toLowerCase()) {
            case "keyword": return "keywords";
            case "supplier": return "supplier";
            case "department":
            case "costcenter": return "department";
            case "clustername": return "cluster_name";
            case "target": return "keywords";
            default: return "keywords";
        }
    }
}
