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
import org.springframework.data.mongodb.core.BulkOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
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
    private final ClusterStatisticsService clusterStatisticsService;

    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(
            Math.max(2, Runtime.getRuntime().availableProcessors()));

    // ============================================================
    // 1. 미병합 클러스터 생성 (병렬 처리)
    // ============================================================

    public Map<String, Object> generateUnmergedClusters(
            String sessionId, boolean includeSupplier, boolean includeCostCenter) {

        log.info("[GENERATE] 미병합 클러스터 생성 시작: sessionId={}, supplier={}, costCenter={}",
                sessionId, includeSupplier, includeCostCenter);
        clusterStatisticsService.cancelSessionCompletionIfNeeded(sessionId);
        long start = System.currentTimeMillis();

        // ★ 안전 패턴: 모든 데이터를 메모리에 준비한 후에만 DB를 변경한다.
        // 조회/그룹핑/객체 생성 중 실패하면 기존 데이터가 보존됨.

        Query query = new Query(Criteria.where("session_id").is(sessionId));
        query.fields()
                .include("raw_data_id")
                .include("keywords.final_keywords")
                .include("money")
                .include("department")
                .include("supplier");

        List<Document> pvDocs;
        try {
            pvDocs = mongoTemplate.find(query, Document.class, "process_view_data");
        } catch (Exception e) {
            log.error("[GENERATE] process_view_data 조회 실패: sessionId={}", sessionId, e);
            throw new BusinessException("GENERATE_FAILED",
                    "process_view_data 조회 중 오류가 발생했습니다: " + e.getMessage());
        }
        log.info("[GENERATE] process_view_data 조회: {}건, {}ms", pvDocs.size(), System.currentTimeMillis() - start);

        if (pvDocs.isEmpty()) {
            log.warn("[GENERATE] process_view_data가 비어 있음: sessionId={}", sessionId);
            throw new BusinessException("NO_DATA", "클러스터링할 데이터가 없습니다. 이전 단계를 먼저 완료해주세요.");
        }

        // 그룹핑: 순차 처리 (parallelStream의 ConcurrentHashMap 동기화 오버헤드 제거)
        Map<String, List<Document>> groupMap = new HashMap<>();

        for (Document doc : pvDocs) {
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

            groupMap.computeIfAbsent(keyBuilder.toString(), k -> new ArrayList<>()).add(doc);
        }

        log.info("[GENERATE] 그룹핑 완료: {}그룹, {}ms", groupMap.size(), System.currentTimeMillis() - start);

        // 클러스터 객체 생성 (순차 - 그룹 수는 수천이므로 parallelStream 불필요)
        AtomicInteger clusterCounter = new AtomicInteger(1);
        List<ClusteringResult> clusters = new ArrayList<>(groupMap.size());

        for (Map.Entry<String, List<Document>> entry : groupMap.entrySet()) {
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
            if (clusterName.length() > 100) clusterName = clusterName.substring(0, 100) + "...";

            clusters.add(ClusteringResult.builder()
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
                    .build());
        }

        log.info("[GENERATE] 클러스터 객체 생성 완료: {}개 (메모리 준비), {}ms",
                clusters.size(), System.currentTimeMillis() - start);

        // ★ 여기서부터 DB 변경 시작 - 모든 메모리 준비가 완료된 후
        // 기존 데이터 삭제 후 새 데이터 삽입 (삭제-삽입 사이 실패 가능성 최소화)
        var deleteResult = mongoTemplate.remove(
                new Query(Criteria.where("session_id").is(sessionId)),
                "clustering_results");
        log.info("[GENERATE] 기존 데이터 삭제: {}건", deleteResult.getDeletedCount());

        int insertedCount = 0;
        try {
            if (!clusters.isEmpty()) {
                int batchSize = 2000;
                for (int i = 0; i < clusters.size(); i += batchSize) {
                    int end = Math.min(i + batchSize, clusters.size());
                    BulkOperations bulkOps = mongoTemplate.bulkOps(BulkOperations.BulkMode.UNORDERED, ClusteringResult.class);
                    bulkOps.insert(clusters.subList(i, end));
                    bulkOps.execute();
                    insertedCount += (end - i);
                }
            }
        } catch (Exception e) {
            log.error("[GENERATE] ★ 벌크 삽입 실패! ({}건 삽입됨/{}건 시도): sessionId={}. " +
                      "기존 데이터 {}건이 삭제된 상태입니다. 재시도 필요.",
                    insertedCount, clusters.size(), sessionId, deleteResult.getDeletedCount(), e);
            throw new BusinessException("GENERATE_FAILED",
                    "클러스터 데이터 저장 중 오류가 발생했습니다 (" + insertedCount + "/" + clusters.size()
                    + "건 저장됨). 클러스터 재생성을 다시 시도해주세요.");
        }

        long elapsed = System.currentTimeMillis() - start;
        log.info("[GENERATE] 미병합 클러스터 생성 완료: {}개, {}ms", clusters.size(), elapsed);

        // 메모리 즉시 해제
        pvDocs.clear();
        groupMap.clear();

        Map<String, Object> result = new HashMap<>();
        result.put("clusterCount", clusters.size());
        result.put("totalRecords", clusters.stream().mapToInt(ClusteringResult::getCount).sum());
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
        List<ClusteringResult> unmerged = getActiveUnmergedClustersLightweight(sessionId);

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
        List<ClusteringResult> unmerged = getActiveUnmergedClustersLightweight(sessionId);

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
        long start = System.currentTimeMillis();
        log.info("[getMergedClusters] 시작: sessionId={}", sessionId);

        try {
        // 메타데이터만 조회 (data_indices, representativeData 제외 → 경량)
        Query mergedQuery = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").gt(0))
                .with(Sort.by("cluster_number"));
        mergedQuery.fields()
                .include("cluster_number")
                .include("cluster_id")
                .include("cluster_name")
                .include("keywords")
                .include("count")
                .include("total_amount")
                .include("supplier")
                .include("department");
        List<ClusteringResult> members = mongoTemplate.find(mergedQuery, ClusteringResult.class);

        if (members.isEmpty()) {
            log.info("[getMergedClusters] 병합 데이터 없음, {}ms", System.currentTimeMillis() - start);
            return Collections.emptyList();
        }

        // 부모/자식 분류
        Set<Integer> parentNumbers = members.stream()
                .filter(c -> c.getClusterId().equals(c.getClusterNumber()))
                .map(ClusteringResult::getClusterNumber)
                .collect(Collectors.toSet());

        Map<Integer, List<ClusteringResult>> childrenByParent = new HashMap<>();
        Map<Integer, ClusteringResult> parentMap = new HashMap<>();
        for (ClusteringResult c : members) {
            if (parentNumbers.contains(c.getClusterNumber())) {
                parentMap.put(c.getClusterNumber(), c);
            } else {
                childrenByParent.computeIfAbsent(c.getClusterId(), k -> new ArrayList<>()).add(c);
            }
        }

        // ★ 고아 부모 자동 정리: 자식이 없고 "(병합 진행 중)" 이름인 부모는 3-Phase 배치 병합 중단 잔여물
        List<Integer> orphanParents = new ArrayList<>();
        for (Integer pn : parentNumbers) {
            ClusteringResult p = parentMap.get(pn);
            if (p != null && childrenByParent.getOrDefault(pn, Collections.emptyList()).isEmpty()) {
                // 자식이 없는 부모 = 고아 (3-Phase 중단 또는 병합 해제 후 잔여)
                orphanParents.add(pn);
                log.warn("[getMergedClusters] 고아 부모 발견 → 자동 삭제: #{} ({})", pn, p.getClusterName());
            }
        }
        if (!orphanParents.isEmpty()) {
            mongoTemplate.remove(
                    new Query(Criteria.where("session_id").is(sessionId)
                            .and("cluster_number").in(orphanParents)
                            .and("cluster_id").gt(0)),
                    "clustering_results");
            orphanParents.forEach(parentNumbers::remove);
            log.info("[getMergedClusters] 고아 부모 {}건 자동 삭제됨", orphanParents.size());
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Integer pn : parentNumbers) {
            ClusteringResult p = parentMap.get(pn);
            if (p == null) continue;
            List<ClusteringResult> children = childrenByParent.getOrDefault(pn, Collections.emptyList());

            Map<String, Object> merged = new LinkedHashMap<>();
            merged.put("clusterNumber", p.getClusterNumber());
            merged.put("clusterName", p.getClusterName());
            merged.put("keywords", p.getKeywords());
            merged.put("count", p.getCount());
            merged.put("totalAmount", p.getTotalAmount());
            merged.put("childCount", children.size());
            // 자식 메타데이터만 (representativeData 없음 → 상세페이지에서 페이징 조회)
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
                        return child;
                    })
                    .collect(Collectors.toList());
            merged.put("children", childList);
            result.add(merged);
        }

        log.info("[getMergedClusters] 완료: {}ms, 병합그룹 {}개 (멤버 {}건)",
                System.currentTimeMillis() - start, result.size(), members.size());
        return result;

        } catch (Exception e) {
            log.error("[getMergedClusters] 예외: sessionId={}, {}ms", sessionId, System.currentTimeMillis() - start, e);
            throw e;
        }
    }

    /**
     * 병합 클러스터 하위 자식 페이징 조회 (대표데이터 포함)
     * - 상세 다이얼로그에서 호출
     */
    public Map<String, Object> getMergedClusterChildren(String sessionId, int parentClusterNumber, int page, int size) {
        long start = System.currentTimeMillis();
        log.info("[getMergedClusterChildren] 시작: sessionId={}, parent={}, page={}, size={}", sessionId, parentClusterNumber, page, size);

        try {
        // 1. 해당 부모의 자식만 조회 (cluster_id = parentClusterNumber, cluster_number != parentClusterNumber)
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(parentClusterNumber)
                        .and("cluster_number").ne(parentClusterNumber))
                .with(Sort.by("cluster_number"));
        query.fields()
                .include("cluster_number")
                .include("cluster_name")
                .include("keywords")
                .include("count")
                .include("total_amount")
                .include("supplier")
                .include("department");

        // 전체 건수
        long totalCount = mongoTemplate.count(query, ClusteringResult.class);
        int totalPages = (int) Math.ceil((double) totalCount / size);

        // 페이징
        query.skip((long) page * size).limit(size);
        List<ClusteringResult> children = mongoTemplate.find(query, ClusteringResult.class);

        // 2. 이 페이지 자식들의 대표데이터 raw_id만 aggregation으로 조회
        Set<Integer> childNumbers = children.stream()
                .map(ClusteringResult::getClusterNumber)
                .collect(Collectors.toSet());

        Map<Integer, String> childFirstRawId = new HashMap<>();
        if (!childNumbers.isEmpty()) {
            List<Document> firstIdDocs = mongoTemplate.getCollection("clustering_results")
                    .aggregate(Arrays.asList(
                            new Document("$match", new Document("session_id", sessionId)
                                    .append("cluster_id", parentClusterNumber)
                                    .append("cluster_number", new Document("$in", new ArrayList<>(childNumbers)))),
                            new Document("$project", new Document("cluster_number", 1)
                                    .append("first_data_index", new Document("$arrayElemAt", Arrays.asList("$data_indices", 0))))
                    )).into(new ArrayList<>());
            for (Document doc : firstIdDocs) {
                Integer cn = doc.getInteger("cluster_number");
                String firstId = doc.getString("first_data_index");
                if (cn != null && firstId != null) childFirstRawId.put(cn, firstId);
            }
        }

        // 3. session_data에서 대표데이터 조회 (이 페이지 분량만 → 최대 size건)
        Set<String> rawIds = new LinkedHashSet<>(childFirstRawId.values());
        Map<String, Map<String, Object>> rawIdToData = rawIds.isEmpty()
                ? Collections.emptyMap()
                : batchFetchSessionData(sessionId, rawIds);

        // 4. 컬럼 매핑
        List<String> visibleColumns = getVisibleColumns(sessionId);

        // 5. 결과 조립
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
                    String firstRawId = childFirstRawId.get(c.getClusterNumber());
                    if (firstRawId != null) {
                        Map<String, Object> repData = rawIdToData.get(firstRawId);
                        if (repData != null) child.put("representativeData", repData);
                    }
                    return child;
                })
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("children", childList);
        result.put("columns", visibleColumns);
        result.put("page", page);
        result.put("size", size);
        result.put("totalCount", totalCount);
        result.put("totalPages", totalPages);

        log.info("[getMergedClusterChildren] 완료: {}ms, parent={}, page={}/{}, children={}/{}",
                System.currentTimeMillis() - start, parentClusterNumber, page, totalPages, childList.size(), totalCount);
        return result;

        } catch (Exception e) {
            log.error("[getMergedClusterChildren] 예외: sessionId={}, parent={}, {}ms", sessionId, parentClusterNumber, System.currentTimeMillis() - start, e);
            throw e;
        }
    }

    // ============================================================
    // 6. 통계
    // ============================================================

    public Map<String, Object> getStatistics(String sessionId) {
        // ★ 최적화: data_indices 제외 경량 조회
        List<ClusteringResult> unmerged = getActiveUnmergedClustersLightweight(sessionId);

        // 병합 그룹: cluster_id > 0 (부모 + 자식) - data_indices 제외
        Query mergedQuery = new Query(Criteria.where("session_id").is(sessionId).and("cluster_id").gt(0));
        mergedQuery.fields()
                .include("cluster_number").include("cluster_id")
                .include("count").include("total_amount");
        List<ClusteringResult> mergedAll = mongoTemplate.find(mergedQuery, ClusteringResult.class);
        List<ClusteringResult> mergeParents = mergedAll.stream()
                .filter(c -> c.getClusterId().equals(c.getClusterNumber()))
                .collect(Collectors.toList());

        // totalRows = 미병합 + 병합 부모 (부모가 자식 합산 포함)
        long totalRows = unmerged.stream().mapToLong(ClusteringResult::getCount).sum()
                + mergeParents.stream().mapToLong(ClusteringResult::getCount).sum();

        long totalClusters = unmerged.size() + mergedAll.size();

        boolean hasSupplier = hasSupplierClustering(sessionId);

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalRows", totalRows);
        stats.put("totalClusters", totalClusters);
        stats.put("unmergedCount", (long) unmerged.size());
        stats.put("unmergedTotalAmount", unmerged.stream().mapToDouble(ClusteringResult::getTotalAmount).sum());
        stats.put("mergedGroupCount", mergeParents.size());
        stats.put("hasSupplier", hasSupplier);
        return stats;
    }

    // ============================================================
    // 7. 클러스터 병합
    // ============================================================

    private static final int BATCH_CHUNK_SIZE = 2000;
    private static final int ASYNC_MERGE_THRESHOLD = 100;

    // ★ 비동기 병합 진행률 추적
    private final ConcurrentHashMap<String, MergeProgress> mergeProgressMap = new ConcurrentHashMap<>();

    // ★ 세션별 활성 병합 추적 (sessionId → taskId)
    private final ConcurrentHashMap<String, String> sessionMergeMap = new ConcurrentHashMap<>();

    // ★ 세션별 활성 3-Phase 배치 병합 추적 (sessionId → parentClusterNumber)
    private final ConcurrentHashMap<String, Integer> sessionBatchMergeMap = new ConcurrentHashMap<>();

    public static class MergeProgress {
        public volatile String status; // RUNNING, COMPLETED, FAILED
        public volatile int progress;  // 0-100
        public volatile String message;
        public volatile Map<String, Object> result;
        public volatile long completedAt; // ★ 완료 시각 (millis)

        MergeProgress() { this.status = "RUNNING"; this.progress = 0; this.message = "시작 중..."; }
    }

    // ★ 완료 후 30초간 결과를 유지하여 늦은 폴링에도 응답
    private static final long PROGRESS_RETAIN_MS = 30_000;

    public Map<String, Object> getMergeProgress(String taskId) {
        MergeProgress mp = mergeProgressMap.get(taskId);
        if (mp == null) return Map.of("status", "NOT_FOUND");
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("status", mp.status);
        r.put("progress", mp.progress);
        r.put("message", mp.message);
        if (mp.result != null) r.put("result", mp.result);
        // ★ 완료/실패 후 일정 시간 경과 시에만 메모리에서 제거
        if ("COMPLETED".equals(mp.status) || "FAILED".equals(mp.status)) {
            if (mp.completedAt == 0) {
                mp.completedAt = System.currentTimeMillis();
            } else if (System.currentTimeMillis() - mp.completedAt > PROGRESS_RETAIN_MS) {
                mergeProgressMap.remove(taskId);
            }
        }
        return r;
    }

    /**
     * 세션에 활성 병합 작업이 있는지 확인
     */
    public Map<String, Object> isMergeActive(String sessionId) {
        String taskId = sessionMergeMap.get(sessionId);
        if (taskId == null) {
            return Map.of("active", false);
        }
        MergeProgress mp = mergeProgressMap.get(taskId);
        if (mp == null || "COMPLETED".equals(mp.status) || "FAILED".equals(mp.status)) {
            sessionMergeMap.remove(sessionId);
            return Map.of("active", false);
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("active", true);
        r.put("taskId", taskId);
        r.put("progress", mp.progress);
        r.put("message", mp.message);
        return r;
    }

    /**
     * selectAll 필터 방식 병합: POST body 크기를 줄이기 위해
     * 백엔드에서 직접 클러스터 번호를 해석한다.
     */
    public Map<String, Object> mergeClustersWithFilter(String sessionId, List<Integer> exceptions,
                                                        String keyword, String supplier) {
        log.info("클러스터 병합(selectAll): sessionId={}, exceptions={}, keyword={}, supplier={}",
                sessionId, exceptions != null ? exceptions.size() : 0, keyword, supplier);

        List<Integer> allNumbers = getAllUnmergedClusterNumbers(sessionId, keyword, supplier);
        if (exceptions != null && !exceptions.isEmpty()) {
            Set<Integer> excSet = new HashSet<>(exceptions);
            allNumbers = allNumbers.stream().filter(n -> !excSet.contains(n)).collect(Collectors.toList());
        }

        log.info("클러스터 병합(selectAll): 해석된 클러스터 수={}", allNumbers.size());
        return mergeClusters(sessionId, allNumbers);
    }

    /**
     * 병합: 소량이면 동기, 대량이면 비동기(taskId 반환)
     */
    public Map<String, Object> mergeClusters(String sessionId, List<Integer> clusterNumbers) {
        log.info("[MERGE] 시작: sessionId={}, count={}", sessionId,
                clusterNumbers == null ? 0 : clusterNumbers.size());

        if (clusterNumbers == null || clusterNumbers.size() < 2) {
            log.warn("[MERGE] 실패: 클러스터 수 부족 (count={})",
                    clusterNumbers == null ? 0 : clusterNumbers.size());
            throw new BusinessException("MERGE_MIN_COUNT", "병합하려면 2개 이상의 클러스터를 선택해야 합니다.");
        }

        // 대량 → 비동기 처리
        if (clusterNumbers.size() >= ASYNC_MERGE_THRESHOLD) {
            String taskId = UUID.randomUUID().toString();
            MergeProgress progress = new MergeProgress();
            mergeProgressMap.put(taskId, progress);
            sessionMergeMap.put(sessionId, taskId); // ★ 세션별 활성 병합 추적
            log.info("[MERGE] 비동기 시작: taskId={}, count={}", taskId, clusterNumbers.size());
            EXECUTOR.submit(() -> {
                try {
                    Map<String, Object> result = doMergeClusters(sessionId, clusterNumbers, progress);
                    progress.result = result;
                    progress.progress = 100;
                    progress.message = "병합 완료";
                    progress.status = "COMPLETED";
                    sessionMergeMap.remove(sessionId); // ★ 완료 시 세션 추적 해제
                    log.info("[MERGE] 비동기 완료: taskId={}, result={}", taskId, result);
                } catch (Exception e) {
                    log.error("[MERGE] 비동기 실패: taskId={}, sessionId={}", taskId, sessionId, e);
                    progress.message = e.getMessage();
                    progress.status = "FAILED";
                    sessionMergeMap.remove(sessionId); // ★ 실패 시에도 세션 추적 해제
                }
            });
            return Map.of("async", true, "taskId", taskId, "totalCount", clusterNumbers.size());
        }

        // 소량 → 동기 처리
        log.info("[MERGE] 동기 처리: count={}", clusterNumbers.size());
        return doMergeClusters(sessionId, clusterNumbers, null);
    }

    private Map<String, Object> doMergeClusters(String sessionId, List<Integer> clusterNumbers,
                                                 MergeProgress progress) {
        long startTime = System.currentTimeMillis();
        log.info("[MERGE-EXEC] 실행 시작: sessionId={}, count={}", sessionId, clusterNumbers.size());
        clusterStatisticsService.cancelSessionCompletionIfNeeded(sessionId);

        int totalSize = clusterNumbers.size();
        updateProgress(progress, 1, "클러스터 조회 중... (0/" + totalSize + ")");

        // ★ Phase 1: 병렬 배치 경량 조회 — dataIndices 제외 (40%)
        log.info("[MERGE-EXEC] Phase1 시작: {}건을 {}개 배치로 병렬 조회 (projection)",
                totalSize, (totalSize + BATCH_CHUNK_SIZE - 1) / BATCH_CHUNK_SIZE);
        List<List<Integer>> queryChunks = partition(clusterNumbers, BATCH_CHUNK_SIZE);
        List<CompletableFuture<List<ClusteringResult>>> queryFutures = new ArrayList<>();
        for (List<Integer> chunk : queryChunks) {
            queryFutures.add(CompletableFuture.supplyAsync(() -> {
                Query q = new Query(Criteria.where("session_id").is(sessionId)
                        .and("cluster_number").in(chunk));
                q.fields().include("cluster_number").include("cluster_id")
                        .include("keywords").include("count").include("total_amount");
                return mongoTemplate.find(q, ClusteringResult.class);
            }, EXECUTOR));
        }

        List<ClusteringResult> targets = new ArrayList<>();
        try {
            for (int i = 0; i < queryFutures.size(); i++) {
                targets.addAll(queryFutures.get(i).join());
                int pct = 1 + (int) ((i + 1.0) / queryFutures.size() * 39);
                updateProgress(progress, pct,
                        "클러스터 조회 중... (" + targets.size() + "/" + totalSize + ")");
            }
        } catch (CompletionException e) {
            log.error("[MERGE-EXEC] Phase1 병렬 조회 실패: sessionId={}", sessionId, e.getCause());
            throw new BusinessException("MERGE_FAILED", "클러스터 조회 중 오류: " + e.getCause().getMessage());
        }

        log.info("[MERGE-EXEC] Phase1 완료: {}건 조회됨 ({}ms)",
                targets.size(), System.currentTimeMillis() - startTime);

        if (targets.size() != totalSize) {
            log.warn("[MERGE-EXEC] 클러스터 수 불일치: 요청={}, 조회={}", totalSize, targets.size());
            throw new BusinessException("CLUSTER_NOT_FOUND",
                    "일부 클러스터를 찾을 수 없습니다. (조회: " + targets.size() + "/" + totalSize + ")");
        }

        for (ClusteringResult target : targets) {
            if (target.getClusterId() != null && target.getClusterId() > 0) {
                throw new BusinessException("ALREADY_MERGED",
                        "클러스터 #" + target.getClusterNumber() + "은(는) 이미 다른 병합 클러스터에 속해 있습니다.");
            }
        }

        // ★ Phase 2: 집계 (40% → 60%)
        log.info("[MERGE-EXEC] Phase2 시작: 데이터 집계");
        updateProgress(progress, 40, "데이터 집계 중...");
        int newClusterNumber = getNextClusterNumber(sessionId);

        Set<String> allKeywords = new LinkedHashSet<>();
        int totalCount = 0;
        double totalAmount = 0;

        for (int i = 0; i < targets.size(); i++) {
            ClusteringResult target = targets.get(i);
            allKeywords.addAll(target.getKeywords());
            totalCount += target.getCount();
            totalAmount += target.getTotalAmount();

            if (i % 1000 == 0) {
                int pct = 40 + (int) ((i + 1.0) / targets.size() * 10);
                updateProgress(progress, pct, "데이터 집계 중... (" + (i + 1) + "/" + totalSize + ")");
            }
        }

        // ★ Phase 2B: dataIndices 배치 조회 (50% → 60%) — 12MB 도달 시 즉시 중단
        updateProgress(progress, 50, "dataIndices 집계 중...");
        List<String> allDataIndices = new ArrayList<>();
        long estimatedDataIndicesBytes = 0;
        boolean dataIndicesTruncated = false;

        List<Integer> targetNumbers = targets.stream()
                .map(ClusteringResult::getClusterNumber).collect(Collectors.toList());

        for (List<Integer> diChunkNums : partition(targetNumbers, 500)) {
            if (dataIndicesTruncated) break;

            Query diQuery = new Query(Criteria.where("session_id").is(sessionId)
                    .and("cluster_number").in(diChunkNums));
            diQuery.fields().include("cluster_number").include("data_indices");

            List<ClusteringResult> diChunk = mongoTemplate.find(diQuery, ClusteringResult.class);
            for (ClusteringResult c : diChunk) {
                if (dataIndicesTruncated) break;
                if (c.getDataIndices() != null) {
                    long chunkBytes = c.getDataIndices().size() * 40L;
                    if (estimatedDataIndicesBytes + chunkBytes > 12_000_000L) {
                        dataIndicesTruncated = true;
                        log.warn("[MERGE-EXEC] 병합 문서 dataIndices 크기 제한 도달 (~{}MB), 이후 생략",
                                estimatedDataIndicesBytes / 1_000_000);
                    } else {
                        allDataIndices.addAll(c.getDataIndices());
                        estimatedDataIndicesBytes += chunkBytes;
                    }
                }
            }
        }

        // ★ Phase 3: 병합 문서 저장 (60% → 65%)
        log.info("[MERGE-EXEC] Phase3 시작: 병합 문서 저장 (keywords={}, dataIndices={}, totalCount={}, ~{}MB)",
                allKeywords.size(), allDataIndices.size(), totalCount, estimatedDataIndicesBytes / 1_000_000);
        updateProgress(progress, 60, "병합 클러스터 저장 중...");
        String mergedName = String.join("_", allKeywords);
        if (mergedName.length() > 100) mergedName = mergedName.substring(0, 100) + "...";

        ClusteringResult merged = ClusteringResult.builder()
                .sessionId(sessionId)
                .clusterNumber(newClusterNumber)
                .clusterId(newClusterNumber)
                .clusterSubId(-1)
                .clusterName(mergedName)
                .keywords(new ArrayList<>(allKeywords))
                .count(totalCount)
                .totalAmount(totalAmount)
                .dataIndices(allDataIndices)
                .createdAt(LocalDateTime.now())
                .build();

        clusteringResultRepository.save(merged);
        log.info("[MERGE-EXEC] Phase3 완료: #{} 저장됨 ({}ms)", newClusterNumber, System.currentTimeMillis() - startTime);
        updateProgress(progress, 65, "자식 클러스터 업데이트 중...");

        // ★ Phase 4: 병렬 배치 업데이트 (65% → 95%)
        log.info("[MERGE-EXEC] Phase4 시작: 자식 {}건 cluster_id 업데이트", targets.size());
        // targetNumbers는 Phase 2B에서 이미 생성됨
        List<List<Integer>> updateChunks = partition(targetNumbers, BATCH_CHUNK_SIZE);
        List<CompletableFuture<Void>> updateFutures = new ArrayList<>();
        for (List<Integer> chunk : updateChunks) {
            updateFutures.add(CompletableFuture.runAsync(() ->
                    mongoTemplate.updateMulti(
                            new Query(Criteria.where("session_id").is(sessionId)
                                    .and("cluster_number").in(chunk)),
                            new Update().set("cluster_id", newClusterNumber),
                            "clustering_results"), EXECUTOR));
        }

        try {
            for (int i = 0; i < updateFutures.size(); i++) {
                updateFutures.get(i).join();
                int pct = 65 + (int) ((i + 1.0) / updateFutures.size() * 30);
                updateProgress(progress, pct,
                        "자식 클러스터 업데이트 중... (" + (i + 1) + "/" + updateChunks.size() + ")");
            }
        } catch (CompletionException e) {
            // ★ Phase 4 실패 시: 부모는 저장되었지만 자식이 일부만 업데이트된 상태
            // 고아 부모를 정리하고 자식들의 cluster_id를 원복
            log.error("[MERGE-EXEC] Phase4 자식 업데이트 실패 → 롤백 시작: sessionId={}, parent=#{}",
                    sessionId, newClusterNumber, e.getCause());
            try {
                mongoTemplate.updateMulti(
                        new Query(Criteria.where("session_id").is(sessionId)
                                .and("cluster_id").is(newClusterNumber)
                                .and("cluster_number").ne(newClusterNumber)),
                        new Update().set("cluster_id", -1),
                        "clustering_results");
                clusteringResultRepository.delete(merged);
                log.info("[MERGE-EXEC] 롤백 완료: 부모 #{} 삭제, 자식 cluster_id 원복", newClusterNumber);
            } catch (Exception rollbackErr) {
                log.error("[MERGE-EXEC] ★ 롤백 실패! 수동 정리 필요: sessionId={}, parent=#{}",
                        sessionId, newClusterNumber, rollbackErr);
            }
            throw new BusinessException("MERGE_FAILED",
                    "자식 클러스터 업데이트 중 오류가 발생했습니다. 롤백되었습니다.");
        }

        updateProgress(progress, 95, "마무리 중...");

        long elapsed = System.currentTimeMillis() - startTime;
        log.info("[MERGE-EXEC] 전체 완료: #{}, {}개 합침, {}ms{}", newClusterNumber, targets.size(),
                elapsed, dataIndicesTruncated ? " (dataIndices 일부 생략)" : "");

        Map<String, Object> result = new HashMap<>();
        result.put("mergedClusterNumber", newClusterNumber);
        result.put("mergedClusterName", mergedName);
        result.put("mergedCount", targets.size());
        result.put("totalCount", totalCount);
        result.put("totalAmount", totalAmount);
        return result;
    }

    private void updateProgress(MergeProgress progress, int pct, String msg) {
        if (progress != null) {
            progress.progress = pct;
            progress.message = msg;
        }
    }

    private <T> List<List<T>> partition(List<T> list, int size) {
        List<List<T>> partitions = new ArrayList<>();
        for (int i = 0; i < list.size(); i += size) {
            partitions.add(list.subList(i, Math.min(i + size, list.size())));
        }
        return partitions;
    }

    // ============================================================
    // 7-1. 3-Phase 배치 병합 (프론트엔드 배치 분할 전송용)
    // ============================================================

    /**
     * Phase 1: 빈 부모 클러스터 생성 (번호 발번만)
     */
    public Map<String, Object> mergeStart(String sessionId) {
        log.info("[MERGE-BATCH] mergeStart: sessionId={}", sessionId);

        // ★ B3: 동시 실행 방지 — 기존 비동기 병합 또는 다른 3-phase 병합 진행 중이면 차단
        if (sessionMergeMap.containsKey(sessionId)) {
            throw new BusinessException("MERGE_IN_PROGRESS", "이미 병합이 진행 중입니다.");
        }
        if (sessionBatchMergeMap.containsKey(sessionId)) {
            throw new BusinessException("MERGE_IN_PROGRESS", "이미 배치 병합이 진행 중입니다.");
        }

        // ★ B4: 고아 부모 정리 (10분 이상 된 "(병합 진행 중)" 상태)
        cleanupOrphanedBatchParents(sessionId);

        clusterStatisticsService.cancelSessionCompletionIfNeeded(sessionId);

        int newClusterNumber = getNextClusterNumber(sessionId);

        ClusteringResult parent = ClusteringResult.builder()
                .sessionId(sessionId)
                .clusterNumber(newClusterNumber)
                .clusterId(newClusterNumber)
                .clusterSubId(-1)
                .clusterName("(병합 진행 중)")
                .keywords(new ArrayList<>())
                .count(0)
                .totalAmount(0.0)
                .dataIndices(new ArrayList<>())
                .createdAt(LocalDateTime.now())
                .build();

        clusteringResultRepository.save(parent);
        sessionBatchMergeMap.put(sessionId, newClusterNumber); // ★ B3: 잠금 등록
        log.info("[MERGE-BATCH] mergeStart 완료: #{}", newClusterNumber);

        Map<String, Object> result = new HashMap<>();
        result.put("mergedClusterNumber", newClusterNumber);
        return result;
    }

    /**
     * Phase 2: 배치 단위 자식 편입 (atomic $set cluster_id → 병렬 안전)
     */
    public Map<String, Object> mergeBatch(String sessionId, Integer mergedClusterNumber, List<Integer> clusterNumbers) {
        log.info("[MERGE-BATCH] mergeBatch: sessionId={}, parent={}, batchSize={}",
                sessionId, mergedClusterNumber, clusterNumbers != null ? clusterNumbers.size() : 0);

        if (clusterNumbers == null || clusterNumbers.isEmpty()) {
            return Map.of("updatedCount", 0);
        }

        // 편입 전 검증: 이미 다른 병합에 속해 있는지 확인
        long alreadyMerged = mongoTemplate.count(
                new Query(Criteria.where("session_id").is(sessionId)
                        .and("cluster_number").in(clusterNumbers)
                        .and("cluster_id").gt(0)),
                ClusteringResult.class);
        if (alreadyMerged > 0) {
            log.warn("[MERGE-BATCH] 이미 병합된 클러스터 {}건 포함", alreadyMerged);
            throw new BusinessException("ALREADY_MERGED",
                    "이미 병합된 클러스터 " + alreadyMerged + "건이 포함되어 있습니다.");
        }

        // atomic $set cluster_id (병렬 호출 안전)
        var updateResult = mongoTemplate.updateMulti(
                new Query(Criteria.where("session_id").is(sessionId)
                        .and("cluster_number").in(clusterNumbers)
                        .and("cluster_id").is(-1)),
                new Update().set("cluster_id", mergedClusterNumber),
                "clustering_results");

        long updatedCount = updateResult.getModifiedCount();
        long requestedCount = clusterNumbers.size();

        // ★ B5: 편입 수 불일치 검증
        if (updatedCount < requestedCount) {
            log.warn("[MERGE-BATCH] 편입 수 불일치: 요청={}, 실제={} (이미 병합된 클러스터 또는 미존재 가능)",
                    requestedCount, updatedCount);
        }
        log.info("[MERGE-BATCH] mergeBatch 완료: {}건 편입 (요청: {}건)", updatedCount, requestedCount);

        Map<String, Object> result = new HashMap<>();
        result.put("updatedCount", updatedCount);
        result.put("requestedCount", requestedCount);
        result.put("skippedCount", requestedCount - updatedCount);
        return result;
    }

    /**
     * Phase 3: 부모 재계산 (모든 배치 완료 후 1회만 호출)
     */
    public Map<String, Object> mergeFinalize(String sessionId, Integer mergedClusterNumber) {
        log.info("[MERGE-BATCH] mergeFinalize: sessionId={}, parent={}", sessionId, mergedClusterNumber);

        try {
            ClusteringResult parent = clusteringResultRepository
                    .findBySessionIdAndClusterNumber(sessionId, mergedClusterNumber)
                    .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                            "병합 클러스터를 찾을 수 없습니다: #" + mergedClusterNumber));

            // ★ Pass 1: 경량 조회 — dataIndices 제외 (메모리 절감)
            Query childQuery = new Query(Criteria.where("session_id").is(sessionId)
                    .and("cluster_id").is(mergedClusterNumber)
                    .and("cluster_number").ne(mergedClusterNumber));
            childQuery.fields().include("cluster_number").include("keywords")
                    .include("count").include("total_amount");
            childQuery.with(Sort.by(Sort.Direction.ASC, "cluster_number"));

            List<ClusteringResult> allChildren = mongoTemplate.find(childQuery, ClusteringResult.class);

            if (allChildren.isEmpty()) {
                // 자식이 없으면 빈 부모 삭제
                clusteringResultRepository.delete(parent);
                log.warn("[MERGE-BATCH] mergeFinalize: 자식 없음, 부모 #{} 삭제", mergedClusterNumber);
                throw new BusinessException("NO_CHILDREN", "편입된 하위 클러스터가 없습니다.");
            }

            Set<String> allKeywords = new LinkedHashSet<>();
            int totalCount = 0;
            double totalAmount = 0;

            for (ClusteringResult child : allChildren) {
                allKeywords.addAll(child.getKeywords());
                totalCount += child.getCount();
                totalAmount += child.getTotalAmount();
            }

            // ★ Pass 2: dataIndices만 배치 조회 (12MB 도달 시 즉시 중단)
            List<String> allDataIndices = new ArrayList<>();
            long estimatedBytes = 0;
            boolean truncated = false;

            List<Integer> childNumbers = allChildren.stream()
                    .map(ClusteringResult::getClusterNumber).collect(Collectors.toList());

            for (List<Integer> diChunkNums : partition(childNumbers, 500)) {
                if (truncated) break;

                Query diQuery = new Query(Criteria.where("session_id").is(sessionId)
                        .and("cluster_number").in(diChunkNums));
                diQuery.fields().include("cluster_number").include("data_indices");

                List<ClusteringResult> diChunk = mongoTemplate.find(diQuery, ClusteringResult.class);
                for (ClusteringResult c : diChunk) {
                    if (truncated) break;
                    if (c.getDataIndices() != null) {
                        long chunkBytes = c.getDataIndices().size() * 40L;
                        if (estimatedBytes + chunkBytes > 12_000_000L) {
                            truncated = true;
                            log.warn("[MERGE-BATCH] dataIndices 크기 제한 도달 (~{}MB)", estimatedBytes / 1_000_000);
                        } else {
                            allDataIndices.addAll(c.getDataIndices());
                            estimatedBytes += chunkBytes;
                        }
                    }
                }
            }

            String mergedName = String.join("_", allKeywords);
            if (mergedName.length() > 100) mergedName = mergedName.substring(0, 100) + "...";

            parent.setKeywords(new ArrayList<>(allKeywords));
            parent.setClusterName(mergedName);
            parent.setCount(totalCount);
            parent.setTotalAmount(totalAmount);
            parent.setDataIndices(allDataIndices);
            clusteringResultRepository.save(parent);

            log.info("[MERGE-BATCH] mergeFinalize 완료: #{}, {}개 자식, count={}, amount={}{}",
                    mergedClusterNumber, allChildren.size(), totalCount, totalAmount,
                    truncated ? " (dataIndices 일부 생략)" : "");

            Map<String, Object> result = new HashMap<>();
            result.put("mergedClusterNumber", mergedClusterNumber);
            result.put("mergedClusterName", mergedName);
            result.put("mergedCount", allChildren.size());
            result.put("totalCount", totalCount);
            result.put("totalAmount", totalAmount);
            return result;
        } finally {
            // ★ B3: 항상 잠금 해제
            sessionBatchMergeMap.remove(sessionId);
        }
    }

    // ============================================================
    // 7-2. 고아 부모 정리 (B4)
    // ============================================================

    /**
     * 10분 이상 된 "(병합 진행 중)" 상태의 고아 부모를 정리한다.
     * 프론트엔드 크래시/네트워크 끊김 시 남은 잔여물을 제거.
     */
    private void cleanupOrphanedBatchParents(String sessionId) {
        LocalDateTime threshold = LocalDateTime.now().minusMinutes(10);
        Query orphanQuery = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_name").is("(병합 진행 중)")
                .and("created_at").lt(threshold));

        List<ClusteringResult> orphans = mongoTemplate.find(orphanQuery, ClusteringResult.class);
        for (ClusteringResult orphan : orphans) {
            log.warn("[MERGE-CLEANUP] 고아 부모 정리: #{}, created={}", orphan.getClusterNumber(), orphan.getCreatedAt());
            // 편입된 자식들의 cluster_id를 원복
            mongoTemplate.updateMulti(
                    new Query(Criteria.where("session_id").is(sessionId)
                            .and("cluster_id").is(orphan.getClusterNumber())
                            .and("cluster_number").ne(orphan.getClusterNumber())),
                    new Update().set("cluster_id", -1),
                    "clustering_results");
            clusteringResultRepository.delete(orphan);
            log.info("[MERGE-CLEANUP] 고아 부모 #{} 삭제, 자식 cluster_id 원복 완료", orphan.getClusterNumber());
        }
        // 잠금도 해제
        if (!orphans.isEmpty()) {
            sessionBatchMergeMap.remove(sessionId);
        }
    }

    // ============================================================
    // 8. 클러스터 병합 해제 (전체)
    // ============================================================

    public Map<String, Object> unmergeClusters(String sessionId, Integer mergedClusterNumber) {
        log.info("클러스터 병합 해제: sessionId={}, mergedClusterNumber={}", sessionId, mergedClusterNumber);
        clusterStatisticsService.cancelSessionCompletionIfNeeded(sessionId);

        ClusteringResult merged = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, mergedClusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                        "병합 클러스터를 찾을 수 없습니다: #" + mergedClusterNumber));

        // 부모 자신 제외하고 자식만 조회
        List<ClusteringResult> children = clusteringResultRepository
                .findBySessionIdAndClusterIdOrderByClusterNumberAsc(sessionId, mergedClusterNumber)
                .stream()
                .filter(c -> !c.getClusterNumber().equals(mergedClusterNumber))
                .collect(Collectors.toList());

        if (children.isEmpty()) {
            throw new BusinessException("NO_CHILDREN", "하위 클러스터가 없습니다.");
        }

        // ★ 최적화: saveAll → updateMulti 단일 쿼리로 자식 cluster_id 일괄 리셋
        mongoTemplate.updateMulti(
                new Query(Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(mergedClusterNumber)
                        .and("cluster_number").ne(mergedClusterNumber)),
                new Update().set("cluster_id", -1),
                "clustering_results");
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
        clusterStatisticsService.cancelSessionCompletionIfNeeded(sessionId);

        ClusteringResult merged = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, mergedClusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                        "병합 클러스터를 찾을 수 없습니다: #" + mergedClusterNumber));

        // 부모 자신 제외하고 자식만 조회
        List<ClusteringResult> allChildren = clusteringResultRepository
                .findBySessionIdAndClusterIdOrderByClusterNumberAsc(sessionId, mergedClusterNumber)
                .stream()
                .filter(c -> !c.getClusterNumber().equals(mergedClusterNumber))
                .collect(Collectors.toList());

        List<ClusteringResult> toRemove = allChildren.stream()
                .filter(c -> childClusterNumbers.contains(c.getClusterNumber()))
                .collect(Collectors.toList());

        if (toRemove.isEmpty()) {
            throw new BusinessException("NO_CHILDREN", "해제할 하위 클러스터가 없습니다.");
        }

        // ★ 최적화: saveAll → updateMulti 단일 쿼리
        List<Integer> removeNumbers = toRemove.stream()
                .map(ClusteringResult::getClusterNumber).collect(Collectors.toList());
        mongoTemplate.updateMulti(
                new Query(Criteria.where("session_id").is(sessionId)
                        .and("cluster_number").in(removeNumbers)),
                new Update().set("cluster_id", -1),
                "clustering_results");

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
            String updatedName = String.join("_", allKeywords);
            if (updatedName.length() > 100) updatedName = updatedName.substring(0, 100) + "...";
            merged.setClusterName(updatedName);
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
        clusterStatisticsService.cancelSessionCompletionIfNeeded(sessionId);

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

        // 모든 자식 수집 (부모 자신 제외, ★ null-safety)
        List<ClusteringResult> allChildrenToMove = all.stream()
                .filter(c -> c.getClusterId() != null
                        && mergedClusterNumbers.contains(c.getClusterId())
                        && !mergedClusterNumbers.contains(c.getClusterNumber()))
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
        if (mergedName.length() > 100) mergedName = mergedName.substring(0, 100) + "...";

        ClusteringResult newParent = ClusteringResult.builder()
                .sessionId(sessionId)
                .clusterNumber(newClusterNumber)
                .clusterId(newClusterNumber)    // 자기 자신의 cluster_number
                .clusterSubId(-1)
                .clusterName(mergedName)
                .keywords(new ArrayList<>(allKeywords))
                .count(totalCount)
                .totalAmount(totalAmount)
                .dataIndices(allDataIndices)
                .createdAt(LocalDateTime.now())
                .build();

        clusteringResultRepository.save(newParent);

        // ★ 최적화: saveAll → updateMulti 단일 쿼리로 자식 cluster_id 일괄 업데이트
        mongoTemplate.updateMulti(
                new Query(Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").in(mergedClusterNumbers)
                        .and("cluster_number").nin(mergedClusterNumbers)),
                new Update().set("cluster_id", newClusterNumber),
                "clustering_results");

        // ★ 최적화: deleteAll(개별삭제) → remove 단일 쿼리
        mongoTemplate.remove(
                new Query(Criteria.where("session_id").is(sessionId)
                        .and("cluster_number").in(mergedClusterNumbers)),
                "clustering_results");

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
        clusterStatisticsService.cancelSessionCompletionIfNeeded(sessionId);

        ClusteringResult parent = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, targetMergedClusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND",
                        "대상 병합 클러스터를 찾을 수 없습니다: #" + targetMergedClusterNumber));

        List<ClusteringResult> targets = clusteringResultRepository
                .findBySessionIdAndClusterNumberIn(sessionId, clusterNumbers);

        if (targets.isEmpty()) {
            throw new BusinessException("CLUSTER_NOT_FOUND", "추가할 클러스터를 찾을 수 없습니다.");
        }

        // ★ 최적화: saveAll → updateMulti 단일 쿼리로 자식 편입
        mongoTemplate.updateMulti(
                new Query(Criteria.where("session_id").is(sessionId)
                        .and("cluster_number").in(clusterNumbers)),
                new Update().set("cluster_id", targetMergedClusterNumber),
                "clustering_results");

        // 부모 재계산 (기존 자식 + 새 자식, 부모 자신 제외)
        List<ClusteringResult> allChildren = clusteringResultRepository
                .findBySessionIdAndClusterIdOrderByClusterNumberAsc(sessionId, targetMergedClusterNumber)
                .stream()
                .filter(c -> !c.getClusterNumber().equals(targetMergedClusterNumber))
                .collect(Collectors.toList());

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
        String parentName = String.join("_", allKeywords);
        if (parentName.length() > 100) parentName = parentName.substring(0, 100) + "...";
        parent.setClusterName(parentName);
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
        clusterStatisticsService.cancelSessionCompletionIfNeeded(sessionId);
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

    public List<Integer> getAllUnmergedClusterNumbers(String sessionId, String keyword, String supplier) {
        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(-1);

        if (keyword != null && !keyword.isBlank()) {
            criteria = criteria.and("keywords").is(keyword);
        }
        if (supplier != null && !supplier.isBlank()) {
            criteria = criteria.and("supplier").is(supplier);
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
        // ★ 최적화: 전체 로드 후 필터 → cluster_id == -1 직접 조회 (인덱스 활용)
        return clusteringResultRepository
                .findBySessionIdAndClusterIdOrderByClusterNumberAsc(sessionId, -1);
    }

    /**
     * ★ 최적화: stats/통계 전용 경량 조회 - data_indices 배열 제외 (수만건 문자열 로드 방지)
     */
    private List<ClusteringResult> getActiveUnmergedClustersLightweight(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(-1))
                .with(Sort.by("cluster_number"));
        query.fields()
                .include("session_id").include("cluster_number").include("cluster_id")
                .include("cluster_name").include("keywords").include("count")
                .include("total_amount").include("supplier").include("department");
        // data_indices 제외 → 네트워크 전송량 대폭 감소
        return mongoTemplate.find(query, ClusteringResult.class);
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

        long batchStart = System.currentTimeMillis();
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("raw_data_id").in(rawDataIds));
        query.fields().include("raw_data_id").include("data");

        List<Document> docs = mongoTemplate.find(query, Document.class, "session_data");
        log.info("[batchFetchSessionData] DB조회: {}ms, 요청 {}건 → 결과 {}건",
                System.currentTimeMillis() - batchStart, rawDataIds.size(), docs.size());

        Map<String, Map<String, Object>> result = new HashMap<>();
        for (Document doc : docs) {
            String rawId = doc.getString("raw_data_id");
            Object dataObj = doc.get("data");
            if (rawId != null && dataObj instanceof Document) {
                @SuppressWarnings("unchecked")
                Map<String, Object> data = new LinkedHashMap<>((Document) dataObj);
                // StreamingCell@xxx 오염 데이터 치환
                sanitizeStreamingCellValues(data);
                result.put(rawId, data);
            }
        }
        return result;
    }

    /**
     * StreamingCell@xxx 형태의 오염된 값을 null로 치환
     */
    private void sanitizeStreamingCellValues(Map<String, Object> data) {
        data.replaceAll((key, value) -> {
            if (value instanceof String && ((String) value).contains("StreamingCell@")) {
                return null;
            }
            return value;
        });
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

        if (withinClusterNumbers != null && !withinClusterNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").in(withinClusterNumbers);
        }

        // 검색 및 제외 조건 결합 (동일 필드 충돌 방지를 위해 andOperator 사용)
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

        if (withinClusterNumbers != null && !withinClusterNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").in(withinClusterNumbers);
        }

        // 검색 및 제외 조건 결합 (동일 필드 충돌 방지를 위해 andOperator 사용)
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

    /**
     * 검색 조건 Criteria 생성 (독립적인 Criteria 반환)
     */
    private Criteria buildSearchCriteria(String column, String value, boolean exact) {
        if (column == null || column.isBlank()) column = "keyword";
        String fieldName = getFieldNameForColumn(column);

        if (exact) {
            return Criteria.where(fieldName).is(value);
        } else {
            return Criteria.where(fieldName).regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
        }
    }

    /**
     * 제외 조건 Criteria 생성 (독립적인 Criteria 반환)
     */
    private Criteria buildExcludeCriteria(String column, String value, boolean exact) {
        if (column == null || column.isBlank()) column = "keyword";
        String fieldName = getFieldNameForColumn(column);

        if (exact) {
            return Criteria.where(fieldName).ne(value);
        } else {
            return Criteria.where(fieldName).not().regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
        }
    }

    /**
     * 컬럼명을 MongoDB 필드명으로 변환
     */
    private String getFieldNameForColumn(String column) {
        switch (column.toLowerCase()) {
            case "keyword":
                return "keywords";
            case "supplier":
                return "supplier";
            case "department":
            case "costcenter":
                return "department";
            case "clustername":
                return "cluster_name";
            case "target":
                return "keywords"; // 타겟열은 키워드 필드에 저장됨
            default:
                return "keywords";
        }
    }

    // Legacy methods - 기존 호환성을 위해 유지 (향후 제거 예정)
    @Deprecated
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
     * 검색 가능한 컬럼 목록 조회 (실제 컬럼명 반환)
     */
    public List<Map<String, String>> getSearchableColumns(String sessionId) {
        List<Map<String, String>> columns = new ArrayList<>();

        // FileSession에서 실제 컬럼명 조회
        Query sessionQuery = new Query(Criteria.where("session_id").is(sessionId));
        Document sessionDoc = mongoTemplate.findOne(sessionQuery, Document.class, "file_sessions");

        String supplierColumnName = sessionDoc != null ? sessionDoc.getString("supplier_column") : null;
        String costCenterColumnName = sessionDoc != null ? sessionDoc.getString("cost_center_column") : null;
        String targetColumnName = sessionDoc != null ? sessionDoc.getString("target_column") : null;

        // 기본 항목: 키워드, 클러스터명
        columns.add(Map.of("key", "keyword", "label", "키워드"));
        columns.add(Map.of("key", "clusterName", "label", "클러스터명"));

        // 타겟열 (설정된 경우)
        if (targetColumnName != null && !targetColumnName.isBlank()) {
            columns.add(Map.of("key", "target", "label", targetColumnName));
        }

        // 공급업체 (데이터가 있는 경우)
        if (hasSupplierClustering(sessionId)) {
            String label = (supplierColumnName != null && !supplierColumnName.isBlank())
                    ? supplierColumnName : "공급업체";
            columns.add(Map.of("key", "supplier", "label", label));
        }

        // 코스트센터 (데이터가 있는 경우)
        Query deptQuery = new Query(Criteria.where("session_id").is(sessionId)
                .and("department").ne(null)).limit(1);
        if (mongoTemplate.exists(deptQuery, ClusteringResult.class)) {
            String label = (costCenterColumnName != null && !costCenterColumnName.isBlank())
                    ? costCenterColumnName : "코스트센터";
            columns.add(Map.of("key", "department", "label", label));
        }

        return columns;
    }

    // ============================================================
    // 15. 미병합 항목 일괄 Undefined Cluster 병합
    // ============================================================

    public Map<String, Object> autoMergeUndefined(String sessionId) {
        log.info("미병합 항목 Undefined Cluster 일괄 병합: sessionId={}", sessionId);
        clusterStatisticsService.cancelSessionCompletionIfNeeded(sessionId);

        List<ClusteringResult> unmerged = getActiveUnmergedClusters(sessionId);

        if (unmerged.isEmpty()) {
            Map<String, Object> result = new HashMap<>();
            result.put("merged", false);
            result.put("message", "미병합 항목이 없습니다.");
            return result;
        }

        int newClusterNumber = getNextClusterNumber(sessionId);

        Set<String> allKeywords = new LinkedHashSet<>();
        List<String> allDataIndices = new ArrayList<>();
        int totalCount = 0;
        double totalAmount = 0;

        for (ClusteringResult target : unmerged) {
            allKeywords.addAll(target.getKeywords());
            allDataIndices.addAll(target.getDataIndices());
            totalCount += target.getCount();
            totalAmount += target.getTotalAmount();
        }

        ClusteringResult undefinedParent = ClusteringResult.builder()
                .sessionId(sessionId)
                .clusterNumber(newClusterNumber)
                .clusterId(newClusterNumber)    // 자기 자신의 cluster_number
                .clusterSubId(-1)
                .clusterName("Undefined Cluster")
                .keywords(new ArrayList<>(allKeywords))
                .count(totalCount)
                .totalAmount(totalAmount)
                .dataIndices(allDataIndices)
                .createdAt(LocalDateTime.now())
                .build();

        clusteringResultRepository.save(undefinedParent);

        // ★ 최적화: saveAll(수천건 개별 save) → updateMulti 단일 쿼리
        mongoTemplate.updateMulti(
                new Query(Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(-1)
                        .and("cluster_number").ne(newClusterNumber)),
                new Update().set("cluster_id", newClusterNumber),
                "clustering_results");

        log.info("Undefined Cluster 일괄 병합 완료: #{}, {}개 합침", newClusterNumber, unmerged.size());

        Map<String, Object> result = new HashMap<>();
        result.put("merged", true);
        result.put("mergedClusterNumber", newClusterNumber);
        result.put("mergedCount", unmerged.size());
        result.put("totalCount", totalCount);
        result.put("totalAmount", totalAmount);
        return result;
    }

    // ============================================================
    // 16. 키워드 계층 CRUD (Lv1/Lv2/Lv3)
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
