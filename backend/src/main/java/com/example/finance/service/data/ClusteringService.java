package com.example.finance.service.data;

import com.example.finance.exception.BusinessException;
import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.data.ColumnMappingDocument;
import com.example.finance.repository.data.ClusteringResultRepository;
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
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ClusteringService {

    private final MongoTemplate mongoTemplate;
    private final ClusteringResultRepository clusteringResultRepository;

    // ============================================================
    // 1. 미병합 클러스터 생성
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

        // 그룹핑 키: 키워드세트 + (옵션) supplier + (옵션) department
        Map<String, List<Document>> groupMap = new LinkedHashMap<>();

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

        List<ClusteringResult> clusters = new ArrayList<>();
        int clusterNumber = 1;

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

            double totalAmount = 0;
            for (Document doc : docs) {
                Object moneyObj = doc.get("money");
                if (moneyObj != null) {
                    try { totalAmount += Double.parseDouble(moneyObj.toString()); }
                    catch (NumberFormatException ignored) {}
                }
            }

            String supplierVal = includeSupplier ? first.getString("supplier") : null;
            String deptVal = includeCostCenter ? first.getString("department") : null;

            String clusterName = keywords.isEmpty() ? "(키워드 없음)" : String.join("_", keywords);

            ClusteringResult cluster = ClusteringResult.builder()
                    .sessionId(sessionId)
                    .clusterNumber(clusterNumber)
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

            clusters.add(cluster);
            clusterNumber++;
        }

        if (!clusters.isEmpty()) {
            clusteringResultRepository.saveAll(clusters);
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
    // 2. 미병합 클러스터 조회 (페이징 + 대표 데이터)
    // ============================================================

    public Map<String, Object> getUnmergedClusters(
            String sessionId, int page, int size, String keyword) {

        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(-1);

        // 병합 클러스터(부모)는 제외: 자식이 있는 클러스터 번호를 찾아서 제외
        Set<Integer> mergedParentNumbers = getMergedParentNumbers(sessionId);
        if (!mergedParentNumbers.isEmpty()) {
            criteria = criteria.and("cluster_number").nin(mergedParentNumbers);
        }

        if (keyword != null && !keyword.isBlank()) {
            criteria = criteria.and("keywords").is(keyword);
        }

        long totalCount = mongoTemplate.count(new Query(criteria), ClusteringResult.class);

        Query query = new Query(criteria)
                .with(Sort.by("cluster_number"))
                .skip((long) page * size)
                .limit(size);

        List<ClusteringResult> clusters = mongoTemplate.find(query, ClusteringResult.class);

        // visible columns 조회
        List<String> visibleColumns = getVisibleColumns(sessionId);

        // 대표 데이터 (각 클러스터의 data_indices[0])
        List<Map<String, Object>> dataWithRepresentative = new ArrayList<>();
        Set<String> firstRawIds = new LinkedHashSet<>();
        for (ClusteringResult c : clusters) {
            if (c.getDataIndices() != null && !c.getDataIndices().isEmpty()) {
                firstRawIds.add(c.getDataIndices().get(0));
            }
        }

        Map<String, Map<String, Object>> rawIdToData = batchFetchSessionData(sessionId, firstRawIds);

        for (ClusteringResult c : clusters) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("clusterNumber", c.getClusterNumber());
            row.put("clusterName", c.getClusterName());
            row.put("keywords", c.getKeywords());
            row.put("count", c.getCount());
            row.put("totalAmount", c.getTotalAmount());
            row.put("supplier", c.getSupplier());
            row.put("department", c.getDepartment());

            // 대표 데이터 추가
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
    // 3. 키워드 통계
    // ============================================================

    public List<Map<String, Object>> getKeywordStats(String sessionId) {
        List<ClusteringResult> unmerged = getActiveUnmergedClusters(sessionId);

        Map<String, long[]> kwStats = new LinkedHashMap<>(); // keyword -> [count, totalAmount*100]

        for (ClusteringResult c : unmerged) {
            for (String kw : c.getKeywords()) {
                long[] stats = kwStats.computeIfAbsent(kw, k -> new long[]{0, 0});
                stats[0] += c.getCount();
                stats[1] += (long) (c.getTotalAmount() * 100);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        int rank = 1;
        // count 기준 내림차순 정렬
        List<Map.Entry<String, long[]>> sorted = new ArrayList<>(kwStats.entrySet());
        sorted.sort((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]));

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
    // 4. 공급업체 통계
    // ============================================================

    public List<Map<String, Object>> getSupplierStats(String sessionId) {
        List<ClusteringResult> unmerged = getActiveUnmergedClusters(sessionId);

        // supplier 필드가 있는 클러스터만 대상 (클러스터링 조건에 공급업체가 포함된 경우)
        Map<String, long[]> supStats = new LinkedHashMap<>();

        for (ClusteringResult c : unmerged) {
            String sup = c.getSupplier();
            if (sup == null || sup.isBlank()) sup = "(미지정)";
            long[] stats = supStats.computeIfAbsent(sup, k -> new long[]{0, 0});
            stats[0] += c.getCount();
            stats[1] += (long) (c.getTotalAmount() * 100);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        int rank = 1;
        List<Map.Entry<String, long[]>> sorted = new ArrayList<>(supStats.entrySet());
        sorted.sort((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]));

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

    /**
     * 공급업체 조건으로 클러스터링 되었는지 확인
     */
    public boolean hasSupplierClustering(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .and("supplier").ne(null))
                .limit(1);
        return mongoTemplate.exists(query, ClusteringResult.class);
    }

    // ============================================================
    // 5. 병합 클러스터 목록
    // ============================================================

    public List<Map<String, Object>> getMergedClusters(String sessionId) {
        List<ClusteringResult> all = clusteringResultRepository
                .findBySessionIdOrderByClusterNumberAsc(sessionId);

        Set<Integer> mergedClusterNumbers = all.stream()
                .filter(c -> c.getClusterId() > 0)
                .map(ClusteringResult::getClusterId)
                .collect(Collectors.toSet());

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

                List<Map<String, Object>> childList = children.stream()
                        .map(c -> {
                            Map<String, Object> child = new LinkedHashMap<>();
                            child.put("clusterNumber", c.getClusterNumber());
                            child.put("clusterName", c.getClusterName());
                            child.put("keywords", c.getKeywords());
                            child.put("count", c.getCount());
                            child.put("totalAmount", c.getTotalAmount());
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

        for (ClusteringResult target : targets) {
            target.setClusterId(newClusterNumber);
        }
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
    // 8. 클러스터 병합 해제
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

        for (ClusteringResult child : children) {
            child.setClusterId(-1);
        }
        clusteringResultRepository.saveAll(children);
        clusteringResultRepository.delete(merged);

        log.info("병합 해제 완료: {}개 복원", children.size());

        Map<String, Object> result = new HashMap<>();
        result.put("restoredCount", children.size());
        result.put("deletedClusterNumber", mergedClusterNumber);
        return result;
    }

    // ============================================================
    // 9. 클러스터명 수정
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
    // 10. 전체 미병합 클러스터 번호 조회 (selectAll 병합용)
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

    /**
     * 활성 미병합 클러스터 목록 (병합 부모 제외)
     */
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

    /**
     * 병합 부모 클러스터 번호 조회
     */
    private Set<Integer> getMergedParentNumbers(String sessionId) {
        List<ClusteringResult> all = clusteringResultRepository
                .findBySessionIdOrderByClusterNumberAsc(sessionId);
        return all.stream()
                .filter(c -> c.getClusterId() > 0)
                .map(ClusteringResult::getClusterId)
                .collect(Collectors.toSet());
    }

    /**
     * visible columns 조회 (column_mapping)
     */
    private List<String> getVisibleColumns(String sessionId) {
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("is_visible").is(true))
                .with(Sort.by("sequence"));

        return mongoTemplate.find(query, ColumnMappingDocument.class).stream()
                .map(ColumnMappingDocument::getOriginalName)
                .collect(Collectors.toList());
    }

    /**
     * session_data 배치 조회 (raw_data_id 기반)
     */
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
}
