package com.example.finance.service.data;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

/**
 * 데이터 변환 서비스 (Step 4)
 *
 * C# 원본: uc_DataTransform.cs
 * - 키워드 병합 리스트 생성
 * - 집계 계산 (병렬 처리)
 * - MongoDB Aggregation Pipeline
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DataTransformService {

    private final MongoTemplate mongoTemplate;

    // ⭐ 병렬 처리용 스레드 풀 (CPU 코어 * 4)
    private final ExecutorService executorService = Executors.newFixedThreadPool(
            Runtime.getRuntime().availableProcessors() * 4
    );

    /**
     * 키워드 병합 리스트 생성 (병렬 처리)
     *
     * C# 원본: create_merge_keyword_list()
     *
     * MongoDB Aggregation:
     * - process_view_data 전체 조회
     * - final_keywords 언팩
     * - 키워드별 그룹핑 및 카운트
     */
    public List<KeywordSummary> createKeywordMergeList(
            String sessionId,
            String amountFieldName
    ) {
        log.info("Creating keyword merge list for session: {}", sessionId);

        // MongoDB Aggregation Pipeline
        Aggregation aggregation = Aggregation.newAggregation(
                // 1. 세션 필터링
                Aggregation.match(Criteria.where("session_id").is(sessionId)),

                // 2. final_keywords 배열 언팩
                Aggregation.unwind("final_keywords"),

                // 3. raw_data 조인 (금액 계산용)
                Aggregation.lookup(
                        "raw_data",
                        "raw_data_id",
                        "_id",
                        "raw_data_info"
                ),

                // 4. 언팩 (배열 → 객체)
                Aggregation.unwind("raw_data_info"),

                // 5. 키워드별 그룹핑
                Aggregation.group("final_keywords")
                        .count().as("count")
                        .sum("raw_data_info.data." + amountFieldName).as("totalAmount"),

                // 6. 결과 정렬 (금액 내림차순)
                Aggregation.sort(org.springframework.data.domain.Sort.Direction.DESC, "totalAmount"),

                // 7. 필드 재구성
                Aggregation.project()
                        .and("_id").as("keyword")
                        .and("count").as("count")
                        .and("totalAmount").as("totalAmount")
        );

        AggregationResults<Document> results = mongoTemplate.aggregate(
                aggregation,
                "process_view_data",
                Document.class
        );

        // Document → KeywordSummary 변환
        return results.getMappedResults().stream()
                .map(doc -> KeywordSummary.builder()
                        .keyword(doc.getString("keyword"))
                        .count(doc.getInteger("count", 0))
                        .totalAmount(doc.getLong("totalAmount") != null
                                ? doc.getLong("totalAmount") : 0L)
                        .build())
                .collect(Collectors.toList());
    }

    /**
     * 키워드 일괄 변환 (병렬 처리)
     *
     * C# 원본: change_keyword_Click() → ReplaceDataTableValues()
     *
     * 예: ["abc", "def", "ghi"] → "merged_keyword"
     */
    public void replaceKeywords(
            String sessionId,
            List<String> fromKeywords,
            String toKeyword
    ) {
        log.info("Replacing keywords: {} → {}", fromKeywords, toKeyword);

        // MongoDB 업데이트 쿼리
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("final_keywords").in(fromKeywords)
        );

        Update update = new Update();

        // 1. 기존 키워드 제거
        for (String fromKeyword : fromKeywords) {
            update.pull("final_keywords", fromKeyword);
        }

        // 2. 새 키워드 추가 (중복 방지)
        update.addToSet("final_keywords", toKeyword);

        // 3. 일괄 업데이트
        mongoTemplate.updateMulti(query, update, "process_view_data");

        log.info("Keywords replaced successfully");
    }

    /**
     * 집계 계산 (병렬 처리)
     *
     * C# 원본: CreateSetGroupDataTableAsync()
     *
     * MongoDB Aggregation Pipeline:
     * - 키워드 조합별 그룹핑
     * - 금액 합계, 개수 계산
     */
    public List<AggregatedData> aggregateData(
            String sessionId,
            List<String> groupByKeywords,
            String amountFieldName
    ) {
        log.info("Aggregating data by keywords: {}", groupByKeywords);

        // Aggregation Pipeline 동적 생성
        Aggregation aggregation = Aggregation.newAggregation(
                // 1. 세션 필터링
                Aggregation.match(Criteria.where("session_id").is(sessionId)),

                // 2. 키워드 필터링 (선택된 키워드만)
                Aggregation.match(
                        Criteria.where("final_keywords").all(groupByKeywords)
                ),

                // 3. raw_data 조인
                Aggregation.lookup(
                        "raw_data",
                        "raw_data_id",
                        "_id",
                        "raw_data_info"
                ),

                // 4. 언팩
                Aggregation.unwind("raw_data_info"),

                // 5. 키워드 조합 생성 (정렬된 문자열)
                Aggregation.project()
                        .and("final_keywords").as("keywords")
                        .and("raw_data_info.data").as("data"),

                // 6. 그룹핑 (키워드 조합별)
                Aggregation.group("keywords")
                        .count().as("count")
                        .sum("data." + amountFieldName).as("totalAmount")
                        .first("data").as("sampleData"),

                // 7. 정렬 (금액 내림차순)
                Aggregation.sort(org.springframework.data.domain.Sort.Direction.DESC, "totalAmount")
        );

        AggregationResults<Document> results = mongoTemplate.aggregate(
                aggregation,
                "process_view_data",
                Document.class
        );

        // Document → AggregatedData 변환
        return results.getMappedResults().stream()
                .map(doc -> {
                    @SuppressWarnings("unchecked")
                    List<String> keywords = (List<String>) doc.get("_id");
                    String keywordCombination = keywords != null
                            ? String.join(" + ", keywords)
                            : "";

                    Document sampleData = (Document) doc.get("sampleData");

                    return AggregatedData.builder()
                            .keywordCombination(keywordCombination)
                            .count(doc.getInteger("count", 0))
                            .totalAmount(doc.getLong("totalAmount") != null
                                    ? doc.getLong("totalAmount") : 0L)
                            .department(sampleData != null ? sampleData.getString("부서명") : null)
                            .supplier(sampleData != null ? sampleData.getString("거래처명") : null)
                            .build();
                })
                .collect(Collectors.toList());
    }

    /**
     * 키워드 빈도수 계산 (병렬 처리)
     *
     * C# 원본: PLINQ GroupBy
     */
    public Map<String, Integer> calculateKeywordFrequency(String sessionId) {
        log.info("Calculating keyword frequency for session: {}", sessionId);

        // MongoDB Aggregation
        Aggregation aggregation = Aggregation.newAggregation(
                Aggregation.match(Criteria.where("session_id").is(sessionId)),
                Aggregation.unwind("final_keywords"),
                Aggregation.group("final_keywords").count().as("frequency"),
                Aggregation.sort(org.springframework.data.domain.Sort.Direction.DESC, "frequency")
        );

        AggregationResults<Document> results = mongoTemplate.aggregate(
                aggregation,
                "process_view_data",
                Document.class
        );

        // ConcurrentHashMap으로 변환
        return results.getMappedResults().stream()
                .collect(Collectors.toConcurrentMap(
                        doc -> doc.getString("_id"),
                        doc -> doc.getInteger("frequency", 0),
                        (a, b) -> a,
                        ConcurrentHashMap::new
                ));
    }

    // ========== DTO 클래스 ==========

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class KeywordSummary {
        private String keyword;
        private Integer count;
        private Long totalAmount;
    }

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class AggregatedData {
        private String keywordCombination;
        private Integer count;
        private Long totalAmount;
        private String department;
        private String supplier;
    }
}