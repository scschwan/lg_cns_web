package com.example.finance.service.data;

import com.example.finance.exception.BusinessException;
import com.example.finance.model.data.ClusteringResult;
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

/**
 * 클러스터링 서비스 (Step 5)
 *
 * - 미병합 클러스터 생성 (process_view_data 기반 키워드 세트 그룹핑)
 * - 클러스터 목록 조회 (페이징)
 * - 클러스터 병합
 * - 클러스터 병합 해제 (전체)
 * - 통계 조회
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClusteringService {

    private final MongoTemplate mongoTemplate;
    private final ClusteringResultRepository clusteringResultRepository;

    /**
     * 미병합 클러스터 생성
     *
     * process_view_data에서 keywords.final_keywords 기준으로 그룹핑.
     * 키워드 세트가 동일한 행들을 하나의 클러스터로 묶음 (순서 무관).
     * 기존 클러스터 결과가 있으면 삭제 후 재생성.
     */
    public Map<String, Object> generateUnmergedClusters(String sessionId) {
        log.info("미병합 클러스터 생성 시작: sessionId={}", sessionId);
        long start = System.currentTimeMillis();

        // 기존 클러스터 삭제
        clusteringResultRepository.deleteBySessionId(sessionId);

        // process_view_data 전체 조회
        Query query = new Query(Criteria.where("session_id").is(sessionId));
        query.fields()
                .include("raw_data_id")
                .include("keywords.final_keywords")
                .include("money")
                .include("department")
                .include("supplier");

        List<Document> pvDocs = mongoTemplate.find(query, Document.class, "process_view_data");
        log.info("process_view_data 조회: {}건", pvDocs.size());

        // 키워드 세트 기준 그룹핑 (순서 무관 → 정렬 후 join하여 키로 사용)
        Map<String, List<Document>> groupMap = new LinkedHashMap<>();

        for (Document doc : pvDocs) {
            Document kwDoc = (Document) doc.get("keywords");
            List<String> finalKeywords = new ArrayList<>();
            if (kwDoc != null) {
                @SuppressWarnings("unchecked")
                List<String> kws = (List<String>) kwDoc.get("final_keywords");
                if (kws != null) {
                    finalKeywords = kws;
                }
            }

            // 순서 무관 그룹핑: 정렬 후 조인
            List<String> sorted = new ArrayList<>(finalKeywords);
            Collections.sort(sorted);
            String groupKey = String.join("|", sorted);

            groupMap.computeIfAbsent(groupKey, k -> new ArrayList<>()).add(doc);
        }

        // 그룹별 클러스터 생성
        List<ClusteringResult> clusters = new ArrayList<>();
        int clusterNumber = 1;

        for (Map.Entry<String, List<Document>> entry : groupMap.entrySet()) {
            List<Document> docs = entry.getValue();

            // 키워드 추출 (첫 번째 문서에서)
            List<String> keywords = new ArrayList<>();
            Document firstKwDoc = (Document) docs.get(0).get("keywords");
            if (firstKwDoc != null) {
                @SuppressWarnings("unchecked")
                List<String> kws = (List<String>) firstKwDoc.get("final_keywords");
                if (kws != null) {
                    keywords = new ArrayList<>(kws);
                }
            }

            // raw_data_id 수집
            List<String> dataIndices = docs.stream()
                    .map(d -> d.getString("raw_data_id"))
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());

            // 금액 합산
            double totalAmount = 0;
            for (Document doc : docs) {
                Object moneyObj = doc.get("money");
                if (moneyObj != null) {
                    try {
                        totalAmount += Double.parseDouble(moneyObj.toString());
                    } catch (NumberFormatException ignored) {
                    }
                }
            }

            // 클러스터명: 키워드 조합
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
                    .createdAt(LocalDateTime.now())
                    .build();

            clusters.add(cluster);
            clusterNumber++;
        }

        // 배치 저장
        if (!clusters.isEmpty()) {
            clusteringResultRepository.saveAll(clusters);
        }

        long elapsed = System.currentTimeMillis() - start;
        log.info("미병합 클러스터 생성 완료: {}개 클러스터, {}ms", clusters.size(), elapsed);

        Map<String, Object> result = new HashMap<>();
        result.put("clusterCount", clusters.size());
        result.put("totalRecords", pvDocs.size());
        result.put("elapsedMs", elapsed);
        return result;
    }

    /**
     * 클러스터 목록 조회 (미병합 클러스터만, 페이징)
     *
     * cluster_id == -1인 것만 (병합된 자식 제외)
     */
    public Map<String, Object> getUnmergedClusters(String sessionId, int page, int size) {
        log.info("미병합 클러스터 조회: sessionId={}, page={}, size={}", sessionId, page, size);

        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .and("cluster_id").is(-1);

        Query countQuery = new Query(criteria);
        long totalCount = mongoTemplate.count(countQuery, ClusteringResult.class);

        Query query = new Query(criteria)
                .with(Sort.by("cluster_number"))
                .skip((long) page * size)
                .limit(size);

        List<ClusteringResult> clusters = mongoTemplate.find(query, ClusteringResult.class);

        Map<String, Object> result = new HashMap<>();
        result.put("data", clusters);
        result.put("totalCount", totalCount);
        result.put("page", page);
        result.put("size", size);
        result.put("totalPages", (int) Math.ceil((double) totalCount / size));
        return result;
    }

    /**
     * 병합 클러스터 목록 조회
     *
     * 병합 클러스터 = cluster_id가 -1이면서 다른 클러스터의 cluster_id가 자기 cluster_number인 것.
     * 즉, children이 존재하는 클러스터.
     */
    public List<Map<String, Object>> getMergedClusters(String sessionId) {
        log.info("병합 클러스터 조회: sessionId={}", sessionId);

        // 모든 클러스터 조회
        List<ClusteringResult> all = clusteringResultRepository
                .findBySessionIdOrderByClusterNumberAsc(sessionId);

        // cluster_id > 0인 것들의 cluster_id 값 수집 → 이것이 병합 클러스터의 cluster_number
        Set<Integer> mergedClusterNumbers = all.stream()
                .filter(c -> c.getClusterId() > 0)
                .map(ClusteringResult::getClusterId)
                .collect(Collectors.toSet());

        // 병합 클러스터 정보 조합
        List<Map<String, Object>> result = new ArrayList<>();
        for (ClusteringResult cluster : all) {
            if (mergedClusterNumbers.contains(cluster.getClusterNumber())) {
                // 이 클러스터의 자식들 조회
                List<ClusteringResult> children = all.stream()
                        .filter(c -> c.getClusterId().equals(cluster.getClusterNumber()))
                        .collect(Collectors.toList());

                Map<String, Object> merged = new HashMap<>();
                merged.put("clusterNumber", cluster.getClusterNumber());
                merged.put("clusterName", cluster.getClusterName());
                merged.put("keywords", cluster.getKeywords());
                merged.put("count", cluster.getCount());
                merged.put("totalAmount", cluster.getTotalAmount());
                merged.put("childCount", children.size());

                List<Map<String, Object>> childList = children.stream()
                        .map(c -> {
                            Map<String, Object> child = new HashMap<>();
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

    /**
     * 통계 조회
     */
    public Map<String, Object> getStatistics(String sessionId) {
        List<ClusteringResult> all = clusteringResultRepository
                .findBySessionIdOrderByClusterNumberAsc(sessionId);

        // 미병합 클러스터 (cluster_id == -1)
        List<ClusteringResult> unmerged = all.stream()
                .filter(c -> c.getClusterId() == -1)
                .collect(Collectors.toList());

        // 병합된 자식 (cluster_id > 0)
        List<ClusteringResult> mergedChildren = all.stream()
                .filter(c -> c.getClusterId() > 0)
                .collect(Collectors.toList());

        // 병합 클러스터 (다른 클러스터의 cluster_id가 자기 cluster_number인 것)
        Set<Integer> mergedClusterNumbers = mergedChildren.stream()
                .map(ClusteringResult::getClusterId)
                .collect(Collectors.toSet());

        long totalRows = all.stream()
                .filter(c -> c.getClusterId() == -1) // 미병합 + 병합 클러스터(부모)만 카운트
                .mapToLong(ClusteringResult::getCount)
                .sum();

        // 미병합 중 부모가 아닌 것 (순수 미병합)
        long pureUnmergedCount = unmerged.stream()
                .filter(c -> !mergedClusterNumbers.contains(c.getClusterNumber()))
                .count();

        double pureUnmergedAmount = unmerged.stream()
                .filter(c -> !mergedClusterNumbers.contains(c.getClusterNumber()))
                .mapToDouble(ClusteringResult::getTotalAmount)
                .sum();

        long mergedGroupCount = mergedClusterNumbers.size();

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalRows", totalRows);
        stats.put("totalClusters", all.size());
        stats.put("unmergedCount", pureUnmergedCount);
        stats.put("unmergedTotalAmount", pureUnmergedAmount);
        stats.put("mergedGroupCount", mergedGroupCount);
        return stats;
    }

    /**
     * 클러스터 병합
     *
     * 선택된 클러스터들을 하나의 병합 클러스터로 합침.
     * 새 클러스터 문서를 생성하고, 원래 클러스터들의 cluster_id를 새 클러스터의 cluster_number로 설정.
     */
    public Map<String, Object> mergeClusters(String sessionId, List<Integer> clusterNumbers) {
        log.info("클러스터 병합: sessionId={}, clusterNumbers={}", sessionId, clusterNumbers);

        if (clusterNumbers == null || clusterNumbers.size() < 2) {
            throw new BusinessException("MERGE_MIN_COUNT", "병합하려면 2개 이상의 클러스터를 선택해야 합니다.");
        }

        // 대상 클러스터 조회
        List<ClusteringResult> targets = clusteringResultRepository
                .findBySessionIdAndClusterNumberIn(sessionId, clusterNumbers);

        if (targets.size() != clusterNumbers.size()) {
            throw new BusinessException("CLUSTER_NOT_FOUND", "일부 클러스터를 찾을 수 없습니다.");
        }

        // 이미 다른 병합 클러스터에 속한 경우 체크
        for (ClusteringResult target : targets) {
            if (target.getClusterId() > 0) {
                throw new BusinessException("ALREADY_MERGED",
                        "클러스터 #" + target.getClusterNumber() + "은(는) 이미 다른 병합 클러스터에 속해 있습니다.");
            }
        }

        // 새 cluster_number 할당 (현재 세션 최대값 + 1)
        int newClusterNumber = getNextClusterNumber(sessionId);

        // 합산 데이터 계산
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

        // 새 병합 클러스터 생성
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

        // 원래 클러스터들의 cluster_id를 새 클러스터의 cluster_number로 설정
        for (ClusteringResult target : targets) {
            target.setClusterId(newClusterNumber);
        }
        clusteringResultRepository.saveAll(targets);

        log.info("클러스터 병합 완료: 새 클러스터 #{}, {}개 합침", newClusterNumber, targets.size());

        Map<String, Object> result = new HashMap<>();
        result.put("mergedClusterNumber", newClusterNumber);
        result.put("mergedClusterName", mergedName);
        result.put("mergedCount", targets.size());
        result.put("totalCount", totalCount);
        result.put("totalAmount", totalAmount);
        return result;
    }

    /**
     * 클러스터 병합 해제 (전체)
     *
     * 병합 클러스터를 삭제하고, 하위 클러스터들의 cluster_id를 -1로 복원.
     */
    public Map<String, Object> unmergeClusters(String sessionId, Integer mergedClusterNumber) {
        log.info("클러스터 병합 해제: sessionId={}, mergedClusterNumber={}", sessionId, mergedClusterNumber);

        // 병합 클러스터 조회
        ClusteringResult merged = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, mergedClusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND", "병합 클러스터를 찾을 수 없습니다: #" + mergedClusterNumber));

        // 하위 클러스터 조회
        List<ClusteringResult> children = clusteringResultRepository
                .findBySessionIdAndClusterIdOrderByClusterNumberAsc(sessionId, mergedClusterNumber);

        if (children.isEmpty()) {
            throw new BusinessException("NO_CHILDREN", "하위 클러스터가 없습니다. 이미 미병합 상태입니다.");
        }

        // 하위 클러스터 cluster_id 복원
        for (ClusteringResult child : children) {
            child.setClusterId(-1);
        }
        clusteringResultRepository.saveAll(children);

        // 병합 클러스터 삭제
        clusteringResultRepository.delete(merged);

        log.info("병합 해제 완료: {}개 클러스터 복원", children.size());

        Map<String, Object> result = new HashMap<>();
        result.put("restoredCount", children.size());
        result.put("deletedClusterNumber", mergedClusterNumber);
        return result;
    }

    /**
     * 클러스터명 수정
     */
    public void updateClusterName(String sessionId, Integer clusterNumber, String newName) {
        ClusteringResult cluster = clusteringResultRepository
                .findBySessionIdAndClusterNumber(sessionId, clusterNumber)
                .orElseThrow(() -> new BusinessException("CLUSTER_NOT_FOUND", "클러스터를 찾을 수 없습니다: #" + clusterNumber));

        cluster.setClusterName(newName);
        clusteringResultRepository.save(cluster);

        log.info("클러스터명 수정: #{} → {}", clusterNumber, newName);
    }

    /**
     * 다음 cluster_number 계산 (세션 내 최대값 + 1)
     */
    private int getNextClusterNumber(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId))
                .with(Sort.by(Sort.Direction.DESC, "cluster_number"))
                .limit(1);

        ClusteringResult last = mongoTemplate.findOne(query, ClusteringResult.class);
        return (last != null && last.getClusterNumber() != null) ? last.getClusterNumber() + 1 : 1;
    }
}
