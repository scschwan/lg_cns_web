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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ClusteringService {

    private final MongoTemplate mongoTemplate;
    private final ClusteringResultRepository clusteringResultRepository;
    private final SearchKeywordHierarchyRepository keywordHierarchyRepository;

    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(
            Math.max(2, Runtime.getRuntime().availableProcessors()));

    // ============================================================
    // 1. 미병합 클러스터 생성 (병렬 처리)
    // ============================================================

    public Map<String, Object> generateUnmergedClusters(
            String sessionId, boolean includeSupplier, boolean includeCostCenter) {

        log.info("미병합 클러스터 생성: sessionId={}, supplier={}, costCenter={}",
                sessionId, includeSupplier, includeCostCenter);
        long start = System.currentTimeMillis();

        clusteringResultRepository.deleteBySessionId(sessionId);

        Query query = new Query(Criteria.where("session_id").is(sessionId));
        query.fields()
                .include("raw_data_id")
                .include("keywords.final_keywords")
                .include("money")
                .include("department")
                .include("supplier");

        List<Document> pvDocs = mongoTemplate.find(query, Document.class, "process_view_data");
        log.info("process_view_data 조회: {}건", pvDocs.size());

        // 병렬 그룹핑: ConcurrentHashMap 사용
        ConcurrentHashMap<String, List<Document>> groupMap = new ConcurrentHashMap<>();

        pvDocs.parallelStream().forEach(doc -> {
            Document kwDoc = (Document) doc.get("keywords");
            List<String> finalKeywords = new ArrayList<>();
            if (kwDoc != null) {
                @SuppressWarnings("unchecked")
                List<String> kws = (List<String>) kwDoc.get("final_keywords");
                if (kws != null) finalKeywords = kws;
            }

            List<String> sorted = new ArrayList<>(finalKeywords);
            Collections.sort(sorted);
            StringBuilder keyBuilder = new StringBuilder(String.join("|", sorted));

            if (includeSupplier) {
                String sup = doc.getString("supplier");
                keyBuilder.append("||S:").append(sup != null ? sup : "");
            }
            if (includeCostCenter) {
                String dept = doc.getString("department");
                keyBuilder.append("||D:").append(dept != null ? dept : "");
            }

            groupMap.computeIfAbsent(keyBuilder.toString(), k ->
                    Collections.synchronizedList(new ArrayList<>())).add(doc);
        });

        // 병렬로 클러스터 객체 생성
        AtomicInteger clusterCounter = new AtomicInteger(1);
        List<ClusteringResult> clusters = groupMap.entrySet().parallelStream()
                .map(entry -> {
                    List<Document> docs = entry.getValue();
                    Document first = docs.get(0);

                    List<String> keywords = new ArrayList<>();
                    Document firstKwDoc = (Document) first.get("keywords");
                    if (firstKwDoc != null) {
                        @SuppressWarnings("unchecked")
                        List<String> kws = (List<String>) firstKwDoc.get("final_keywords");
                        if (kws != null) keywords = new ArrayList<>(kws);
                    }

                    List<String> dataIndices = docs.stream()
                            .map(d -> d.getString("raw_data_id"))
                            .filter(Objects::nonNull)
                            .collect(Collectors.toList());

                    double totalAmount = docs.stream()
                            .mapToDouble(d -> {
                                Object moneyObj = d.get("money");
                                if (moneyObj == null) return 0;
                                try { return Double.parseDouble(moneyObj.toString()); }
                                catch (NumberFormatException e) { return 0; }
                            }).sum();

                    String supplierVal = includeSupplier ? first.getString("supplier") : null;
                    String deptVal = includeCostCenter ? first.getString("department") : null;
                    String clusterName = keywords.isEmpty() ? "(키워드 없음)" : String.join("_", keywords);

                    return ClusteringResult.builder()
                            .sessionId(sessionId)
                            .clusterNumber(clusterCounter.getAndIncrement())
                            .clusterId(-1)
                            .clusterSubId(-1)
                            .clusterName(clusterName)
                            .keywords(keywords)
                            .count(docs.size())
                            .totalAmount(totalAmount)
                            .dataIndices(dataIndices)
                            .supplier(supplierVal)
                            .department(deptVal)
                            .createdAt(LocalDateTime.now())
                            .build();
                })
                .collect(Collectors.toList());

        // 배치 저장 (대량 데이터 시 청크 분할)
        if (!clusters.isEmpty()) {
            int batchSize = 500;
            for (int i = 0; i < clusters.size(); i += batchSize) {
                int end = Math.min(i + batchSize, clusters.size());
                clusteringResultRepository.saveAll(clusters.subList(i, end));
            }
        }

        long elapsed = System.currentTimeMillis() - start;
        log.info("미병합 클러스터 생성 완료: {}개, {}ms", clusters.size(), elapsed);

        Map<String, Object> result = new HashMap<>();
        result.put("clusterCount", clusters.size());
        result.put("totalRecords", pvDocs.size());
        result.put("elapsedMs", elapsed);
        result.put("includeSupplier", includeSupplier);
        result.put("includeCostCenter", includeCostCenter);
        return result;
    }

    // ============================================================
    // 2. 미병합 클러스터 조회 (페이징 + 대표 데이터, 병렬 조회)
    // ============================================================

    public Map<String, Object> getUnmergedClusters(
            String sessionId, int page, int size, String keyword) {

        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(-1);

        Set<Integer> mergedParentNumbers = getMergedParentNumbers(sessionId);
        if (!mergedParentNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").nin(mergedParentNumbers);
        }

        if (keyword != null && !keyword.isBlank()) {
            criteria = criteria.and("keywords").is(keyword);
        }

        // 병렬 조회: count와 데이터를 동시에 가져오기
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

        // 대표 데이터 (각 클러스터의 data_indices[0])
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
    // 3. 키워드 통계 (병렬 집계)
    // ============================================================

    public List<Map<String, Object>> getKeywordStats(String sessionId) {
        List<ClusteringResult> unmerged = getActiveUnmergedClusters(sessionId);

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
    // 4. 공급업체 통계 (병렬 집계)
    // ============================================================

    public List<Map<String, Object>> getSupplierStats(String sessionId) {
        List<ClusteringResult> unmerged = getActiveUnmergedClusters(sessionId);

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

    public boolean hasSupplierClustering(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .and("supplier").ne(null))
                .limit(1);
        return mongoTemplate.exists(query, ClusteringResult.class);
    }

    // ============================================================
    // 5. 병합 클러스터 목록 (children에 대표데이터 포함)
    // ============================================================

    public List<Map<String, Object>> getMergedClusters(String sessionId) {
        List<ClusteringResult> all = clusteringResultRepository
                .findBySessionIdOrderByClusterNumberAsc(sessionId);

        Set<Integer> mergedClusterNumbers = all.stream()
                .filter(c -> c.getClusterId() > 0)
                .map(ClusteringResult::getClusterId)
                .collect(Collectors.toSet());

        // 대표데이터 일괄 조회
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
            if (mergedClusterNumbers.contains(cluster.getClusterNumber())) {
                List<ClusteringResult> children = all.stream()
                        .filter(c -> c.getClusterId().equals(cluster.getClusterNumber()))
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
                            // 대표데이터
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
    // 6. 통계
    // ============================================================

    public Map<String, Object> getStatistics(String sessionId) {
        List<ClusteringResult> all = clusteringResultRepository
                .findBySessionIdOrderByClusterNumberAsc(sessionId);

        Set<Integer> mergedParents = all.stream()
                .filter(c -> c.getClusterId() > 0)
                .map(ClusteringResult::getClusterId)
                .collect(Collectors.toSet());

        List<ClusteringResult> unmerged = all.stream()
                .filter(c -> c.getClusterId() == -1)
                .collect(Collectors.toList());

        long totalRows = unmerged.stream().mapToLong(ClusteringResult::getCount).sum();

        long pureUnmergedCount = unmerged.stream()
                .filter(c -> !mergedParents.contains(c.getClusterNumber()))
                .count();
        double pureUnmergedAmount = unmerged.stream()
                .filter(c -> !mergedParents.contains(c.getClusterNumber()))
                .mapToDouble(ClusteringResult::getTotalAmount)
                .sum();

        boolean hasSupplier = hasSupplierClustering(sessionId);

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalRows", totalRows);
        stats.put("totalClusters", all.size());
        stats.put("unmergedCount", pureUnmergedCount);
        stats.put("unmergedTotalAmount", pureUnmergedAmount);
        stats.put("mergedGroupCount", mergedParents.size());
        stats.put("hasSupplier", hasSupplier);
        return stats;
    }

    // ============================================================
    // 7. 클러스터 병합
    // ============================================================

    public Map<String, Object> mergeClusters(String sessionId, List<Integer> clusterNumbers) {
        log.info("클러스터 병합: sessionId={}, clusterNumbers={}", sessionId, clusterNumbers);

        if (clusterNumbers == null || clusterNumbers.size() < 2) {
            throw new BusinessException("MERGE_MIN_COUNT", "병합하려면 2개 이상의 클러스터를 선택해야 합니다.");
        }

        List<ClusteringResult> targets = clusteringResultRepository
                .findBySessionIdAndClusterNumberIn(sessionId, clusterNumbers);

        if (targets.size() != clusterNumbers.size()) {
            throw new BusinessException("CLUSTER_NOT_FOUND", "일부 클러스터를 찾을 수 없습니다.");
        }

        for (ClusteringResult target : targets) {
            if (target.getClusterId() > 0) {
                throw new BusinessException("ALREADY_MERGED",
                        "클러스터 #" + target.getClusterNumber() + "은(는) 이미 다른 병합 클러스터에 속해 있습니다.");
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

        ClusteringResult merged = ClusteringResult.builder()
                .sessionId(sessionId)
                .clusterNumber(newClusterNumber)
                .clusterId(-1)
                .clusterSubId(-1)
                .clusterName(mergedName)
                .keywords(new ArrayList<>(allKeywords))
                .count(totalCount)
                .totalAmount(totalAmount)
                .dataIndices(allDataIndices)
                .createdAt(LocalDateTime.now())
                .build();

        clusteringResultRepository.save(merged);

        // 병렬 업데이트
        targets.parallelStream().forEach(target -> target.setClusterId(newClusterNumber));
        clusteringResultRepository.saveAll(targets);

        log.info("클러스터 병합 완료: #{}, {}개 합침", newClusterNumber, targets.size());

        Map<String, Object> result = new HashMap<>();
        result.put("mergedClusterNumber", newClusterNumber);
        result.put("mergedClusterName", mergedName);
        result.put("mergedCount", targets.size());
        result.put("totalCount", totalCount);
        result.put("totalAmount", totalAmount);
        return result;
    }

    // ============================================================
    // 8. 클러스터 병합 해제 (전체)
    // ============================================================

    public Map<String, Object> unmergeClusters(String sessionId, Integer mergedClusterNumber) {
        log.info("클러스터 병합 해제: sessionId={}, mergedClusterNumber={}", sessionId, mergedClusterNumber);

        ClusteringResult merged = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, mergedClusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                        "병합 클러스터를 찾을 수 없습니다: #" + mergedClusterNumber));

        List<ClusteringResult> children = clusteringResultRepository
                .findBySessionIdAndClusterIdOrderByClusterNumberAsc(sessionId, mergedClusterNumber);

        if (children.isEmpty()) {
            throw new BusinessException("NO_CHILDREN", "하위 클러스터가 없습니다.");
        }

        children.parallelStream().forEach(child -> child.setClusterId(-1));
        clusteringResultRepository.saveAll(children);
        clusteringResultRepository.delete(merged);

        log.info("병합 해제 완료: {}개 복원", children.size());

        Map<String, Object> result = new HashMap<>();
        result.put("restoredCount", children.size());
        result.put("deletedClusterNumber", mergedClusterNumber);
        return result;
    }

    // ============================================================
    // 9. 부분 병합 해제 (선택한 자식만 해제)
    // ============================================================

    public Map<String, Object> unmergePartialClusters(
            String sessionId, Integer mergedClusterNumber, List<Integer> childClusterNumbers) {

        log.info("부분 병합 해제: sessionId={}, merged={}, children={}",
                sessionId, mergedClusterNumber, childClusterNumbers);

        ClusteringResult merged = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, mergedClusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                        "병합 클러스터를 찾을 수 없습니다: #" + mergedClusterNumber));

        List<ClusteringResult> allChildren = clusteringResultRepository
                .findBySessionIdAndClusterIdOrderByClusterNumberAsc(sessionId, mergedClusterNumber);

        List<ClusteringResult> toRemove = allChildren.stream()
                .filter(c -> childClusterNumbers.contains(c.getClusterNumber()))
                .collect(Collectors.toList());

        if (toRemove.isEmpty()) {
            throw new BusinessException("NO_CHILDREN", "해제할 하위 클러스터가 없습니다.");
        }

        // 선택한 자식들 해제
        toRemove.parallelStream().forEach(child -> child.setClusterId(-1));
        clusteringResultRepository.saveAll(toRemove);

        // 남은 자식이 있으면 부모 갱신, 없으면 부모 삭제
        List<ClusteringResult> remaining = allChildren.stream()
                .filter(c -> !childClusterNumbers.contains(c.getClusterNumber()))
                .collect(Collectors.toList());

        if (remaining.isEmpty()) {
            clusteringResultRepository.delete(merged);
        } else {
            // 부모 재계산
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
    // 10. 병합 클러스터끼리 병합
    // ============================================================

    public Map<String, Object> mergeMergedClusters(String sessionId, List<Integer> mergedClusterNumbers) {
        log.info("병합 클러스터 merge: sessionId={}, targets={}", sessionId, mergedClusterNumbers);

        if (mergedClusterNumbers == null || mergedClusterNumbers.size() < 2) {
            throw new BusinessException("MERGE_MIN_COUNT", "2개 이상의 병합 클러스터를 선택해야 합니다.");
        }

        List<ClusteringResult> all = clusteringResultRepository
                .findBySessionIdOrderByClusterNumberAsc(sessionId);

        // 대상 병합 클러스터(부모) 찾기
        List<ClusteringResult> targetParents = all.stream()
                .filter(c -> mergedClusterNumbers.contains(c.getClusterNumber()))
                .collect(Collectors.toList());

        if (targetParents.size() != mergedClusterNumbers.size()) {
            throw new BusinessException("CLUSTER_NOT_FOUND", "일부 병합 클러스터를 찾을 수 없습니다.");
        }

        // 모든 자식 수집
        List<ClusteringResult> allChildrenToMove = all.stream()
                .filter(c -> mergedClusterNumbers.contains(c.getClusterId()))
                .collect(Collectors.toList());

        // 새 병합 클러스터 생성
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
                .clusterId(-1)
                .clusterSubId(-1)
                .clusterName(mergedName)
                .keywords(new ArrayList<>(allKeywords))
                .count(totalCount)
                .totalAmount(totalAmount)
                .dataIndices(allDataIndices)
                .createdAt(LocalDateTime.now())
                .build();

        clusteringResultRepository.save(newParent);

        // 모든 자식을 새 부모로 이동
        allChildrenToMove.parallelStream().forEach(child -> child.setClusterId(newClusterNumber));
        clusteringResultRepository.saveAll(allChildrenToMove);

        // 기존 부모 삭제
        clusteringResultRepository.deleteAll(targetParents);

        log.info("병합 클러스터 merge 완료: #{}, {}개 자식", newClusterNumber, allChildrenToMove.size());

        Map<String, Object> result = new HashMap<>();
        result.put("mergedClusterNumber", newClusterNumber);
        result.put("mergedClusterName", mergedName);
        result.put("childCount", allChildrenToMove.size());
        result.put("deletedParentCount", targetParents.size());
        return result;
    }

    // ============================================================
    // 11. 추가 병합 (기존 병합 클러스터에 미병합 클러스터 추가)
    // ============================================================

    public Map<String, Object> addToMergedCluster(
            String sessionId, Integer targetMergedClusterNumber, List<Integer> clusterNumbers) {

        log.info("추가 병합: sessionId={}, target={}, additions={}",
                sessionId, targetMergedClusterNumber, clusterNumbers);

        ClusteringResult parent = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, targetMergedClusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                        "대상 병합 클러스터를 찾을 수 없습니다: #" + targetMergedClusterNumber));

        List<ClusteringResult> targets = clusteringResultRepository
                .findBySessionIdAndClusterNumberIn(sessionId, clusterNumbers);

        if (targets.isEmpty()) {
            throw new BusinessException("CLUSTER_NOT_FOUND", "추가할 클러스터를 찾을 수 없습니다.");
        }

        // 자식으로 편입
        for (ClusteringResult target : targets) {
            target.setClusterId(targetMergedClusterNumber);
        }
        clusteringResultRepository.saveAll(targets);

        // 부모 재계산 (기존 자식 + 새 자식)
        List<ClusteringResult> allChildren = clusteringResultRepository
                .findBySessionIdAndClusterIdOrderByClusterNumberAsc(sessionId, targetMergedClusterNumber);

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
    // 12. 클러스터명 수정
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
    // 13. 전체 미병합 클러스터 번호 조회 (selectAll 병합용)
    // ============================================================

    public List<Integer> getAllUnmergedClusterNumbers(String sessionId, String keyword) {
        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(-1);

        Set<Integer> mergedParentNumbers = getMergedParentNumbers(sessionId);
        if (!mergedParentNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").nin(mergedParentNumbers);
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
    // 내부 헬퍼 메서드
    // ============================================================

    private int getNextClusterNumber(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId))
                .with(Sort.by(Sort.Direction.DESC, "cluster_number"))
                .limit(1);
        ClusteringResult last = mongoTemplate.findOne(query, ClusteringResult.class);
        return (last != null && last.getClusterNumber() != null) ? last.getClusterNumber() + 1 : 1;
    }

    private List<ClusteringResult> getActiveUnmergedClusters(String sessionId) {
        List<ClusteringResult> all = clusteringResultRepository
                .findBySessionIdOrderByClusterNumberAsc(sessionId);

        Set<Integer> mergedParents = all.stream()
                .filter(c -> c.getClusterId() > 0)
                .map(ClusteringResult::getClusterId)
                .collect(Collectors.toSet());

        return all.stream()
                .filter(c -> c.getClusterId() == -1 && !mergedParents.contains(c.getClusterNumber()))
                .collect(Collectors.toList());
    }

    private Set<Integer> getMergedParentNumbers(String sessionId) {
        List<ClusteringResult> all = clusteringResultRepository
                .findBySessionIdOrderByClusterNumberAsc(sessionId);
        return all.stream()
                .filter(c -> c.getClusterId() > 0)
                .map(ClusteringResult::getClusterId)
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

    // ============================================================
    // 14. 고급 검색 (컬럼 선택, 완전일치, 제외 항목, 결과내 재검색)
    // ============================================================

    public Map<String, Object> advancedSearch(
            String sessionId, int page, int size,
            String searchColumn, String searchValue, boolean exactMatch,
            String excludeValue, boolean excludeExactMatch,
            List<Integer> withinClusterNumbers) {

        log.info("고급 검색: sessionId={}, column={}, value={}, exact={}, exclude={}, withinSize={}",
                sessionId, searchColumn, searchValue, exactMatch, excludeValue,
                withinClusterNumbers != null ? withinClusterNumbers.size() : 0);

        // 기본 조건: 미병합 클러스터
        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(-1);

        // 병합 부모 제외
        Set<Integer> mergedParentNumbers = getMergedParentNumbers(sessionId);
        if (!mergedParentNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").nin(mergedParentNumbers);
        }

        // 결과내 재검색: 이전 결과 내에서만 검색
        if (withinClusterNumbers != null && !withinClusterNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").in(withinClusterNumbers);
        }

        // 검색 컬럼별 조건 추가
        if (searchValue != null && !searchValue.isBlank()) {
            criteria = addSearchCriteria(criteria, searchColumn, searchValue, exactMatch);
        }

        // 제외 조건 추가
        if (excludeValue != null && !excludeValue.isBlank()) {
            criteria = addExcludeCriteria(criteria, searchColumn, excludeValue, excludeExactMatch);
        }

        // 병렬 조회: count와 visibleColumns
        Criteria finalCriteria = criteria;
        CompletableFuture<Long> countFuture = CompletableFuture.supplyAsync(
                () -> mongoTemplate.count(new Query(finalCriteria), ClusteringResult.class), EXECUTOR);
        CompletableFuture<List<String>> colFuture = CompletableFuture.supplyAsync(
                () -> getVisibleColumns(sessionId), EXECUTOR);

        // 페이징 조회
        Query query = new Query(criteria)
                .with(Sort.by("cluster_number"))
                .skip((long) page * size)
                .limit(size);
        List<ClusteringResult> clusters = mongoTemplate.find(query, ClusteringResult.class);

        // 대표 데이터 조회
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

        // 결과 데이터 구성
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

        // 현재 검색 결과의 clusterNumber 목록 (재검색용)
        List<Integer> resultClusterNumbers = clusters.stream()
                .map(ClusteringResult::getClusterNumber)
                .collect(Collectors.toList());

        // 전체 결과 clusterNumber (재검색 시 필요)
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

    /**
     * 고급 검색용 - 현재 검색 결과의 전체 clusterNumber 목록 조회
     */
    public List<Integer> getAdvancedSearchClusterNumbers(
            String sessionId,
            String searchColumn, String searchValue, boolean exactMatch,
            String excludeValue, boolean excludeExactMatch,
            List<Integer> withinClusterNumbers) {

        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(-1);

        Set<Integer> mergedParentNumbers = getMergedParentNumbers(sessionId);
        if (!mergedParentNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").nin(mergedParentNumbers);
        }

        if (withinClusterNumbers != null && !withinClusterNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").in(withinClusterNumbers);
        }

        if (searchValue != null && !searchValue.isBlank()) {
            criteria = addSearchCriteria(criteria, searchColumn, searchValue, exactMatch);
        }

        if (excludeValue != null && !excludeValue.isBlank()) {
            criteria = addExcludeCriteria(criteria, searchColumn, excludeValue, excludeExactMatch);
        }

        Query query = new Query(criteria);
        query.fields().include("cluster_number");

        return mongoTemplate.find(query, ClusteringResult.class).stream()
                .map(ClusteringResult::getClusterNumber)
                .collect(Collectors.toList());
    }

    private Criteria addSearchCriteria(Criteria base, String column, String value, boolean exact) {
        if (column == null || column.isBlank()) column = "keyword";

        switch (column.toLowerCase()) {
            case "keyword":
                if (exact) {
                    return base.and("keywords").is(value);
                } else {
                    return base.and("keywords").regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
                }
            case "supplier":
                if (exact) {
                    return base.and("supplier").is(value);
                } else {
                    return base.and("supplier").regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
                }
            case "department":
            case "costcenter":
                if (exact) {
                    return base.and("department").is(value);
                } else {
                    return base.and("department").regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
                }
            case "clustername":
                if (exact) {
                    return base.and("cluster_name").is(value);
                } else {
                    return base.and("cluster_name").regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
                }
            default:
                // 기본: 키워드 검색
                if (exact) {
                    return base.and("keywords").is(value);
                } else {
                    return base.and("keywords").regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
                }
        }
    }

    private Criteria addExcludeCriteria(Criteria base, String column, String value, boolean exact) {
        if (column == null || column.isBlank()) column = "keyword";

        switch (column.toLowerCase()) {
            case "keyword":
                if (exact) {
                    return base.and("keywords").ne(value);
                } else {
                    return base.and("keywords").not().regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
                }
            case "supplier":
                if (exact) {
                    return base.and("supplier").ne(value);
                } else {
                    return base.and("supplier").not().regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
                }
            case "department":
            case "costcenter":
                if (exact) {
                    return base.and("department").ne(value);
                } else {
                    return base.and("department").not().regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
                }
            case "clustername":
                if (exact) {
                    return base.and("cluster_name").ne(value);
                } else {
                    return base.and("cluster_name").not().regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
                }
            default:
                if (exact) {
                    return base.and("keywords").ne(value);
                } else {
                    return base.and("keywords").not().regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
                }
        }
    }

    /**
     * 검색 가능한 컬럼 목록 조회
     */
    public List<Map<String, String>> getSearchableColumns(String sessionId) {
        List<Map<String, String>> columns = new ArrayList<>();
        columns.add(Map.of("key", "keyword", "label", "키워드"));
        columns.add(Map.of("key", "clusterName", "label", "클러스터명"));

        // supplier가 있는지 확인
        if (hasSupplierClustering(sessionId)) {
            columns.add(Map.of("key", "supplier", "label", "공급업체"));
        }

        // department가 있는지 확인
        Query deptQuery = new Query(Criteria.where("session_id").is(sessionId)
                .and("department").ne(null)).limit(1);
        if (mongoTemplate.exists(deptQuery, ClusteringResult.class)) {
            columns.add(Map.of("key", "department", "label", "코스트센터"));
        }

        return columns;
    }

    // ============================================================
    // 15. 키워드 계층 CRUD (Lv1/Lv2/Lv3)
    // ============================================================

    /**
     * 키워드 계층 전체 조회 (트리 구조로 반환)
     */
    public List<Map<String, Object>> getKeywordHierarchy(String sessionId) {
        List<SearchKeywordHierarchy> all = keywordHierarchyRepository
                .findBySessionIdOrderByLevelAscDisplayOrderAsc(sessionId);

        // 레벨별 그룹핑
        Map<Integer, List<SearchKeywordHierarchy>> byLevel = all.stream()
                .collect(Collectors.groupingBy(SearchKeywordHierarchy::getLevel));

        // parent_id로 인덱싱
        Map<String, List<SearchKeywordHierarchy>> byParent = all.stream()
                .filter(k -> k.getParentId() != null)
                .collect(Collectors.groupingBy(SearchKeywordHierarchy::getParentId));

        // Lv1부터 트리 구성
        List<Map<String, Object>> result = new ArrayList<>();
        List<SearchKeywordHierarchy> lv1List = byLevel.getOrDefault(1, Collections.emptyList());

        for (SearchKeywordHierarchy lv1 : lv1List) {
            Map<String, Object> lv1Node = buildKeywordNode(lv1, byParent);
            result.add(lv1Node);
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

    /**
     * 키워드 추가
     */
    public Map<String, Object> addKeywordHierarchy(
            String sessionId, Integer level, String parentId, String keyword) {

        if (level < 1 || level > 3) {
            throw new BusinessException("INVALID_LEVEL", "레벨은 1, 2, 3 중 하나여야 합니다.");
        }
        if (level > 1 && (parentId == null || parentId.isBlank())) {
            throw new BusinessException("PARENT_REQUIRED", "Lv2, Lv3는 상위 키워드 ID가 필요합니다.");
        }
        if (keyword == null || keyword.isBlank()) {
            throw new BusinessException("KEYWORD_REQUIRED", "키워드는 필수입니다.");
        }

        // 같은 레벨에서 최대 order 조회
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

    /**
     * 키워드 수정
     */
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

    /**
     * 키워드 삭제 (하위 키워드도 함께 삭제)
     */
    public Map<String, Object> deleteKeywordHierarchy(String sessionId, String id) {
        SearchKeywordHierarchy kw = keywordHierarchyRepository.findById(id)
                .orElseThrow(() -> new BusinessException("KEYWORD_NOT_FOUND", "키워드를 찾을 수 없습니다."));

        int deletedCount = 1;

        // 하위 키워드 삭제 (재귀적)
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
}
