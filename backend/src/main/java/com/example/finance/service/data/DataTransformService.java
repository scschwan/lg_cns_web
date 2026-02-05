package com.example.finance.service.data;

import com.example.finance.exception.BusinessException;
import com.example.finance.model.data.ColumnMappingDocument;
import com.example.finance.model.session.FileSession;
import com.example.finance.repository.data.ColumnMappingRepository;
import com.example.finance.repository.session.FileSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 데이터 변환 서비스 (Step 4)
 *
 * - 키워드 통계 (group by count + money 합산)
 * - 키워드 like 검색
 * - 키워드 변환 (치환)
 * - 원본/검색결과 데이터 페이징 조회
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DataTransformService {

    private final MongoTemplate mongoTemplate;
    private final FileSessionRepository fileSessionRepository;
    private final ColumnMappingRepository columnMappingRepository;

    /**
     * 키워드 통계 조회 (group by count + money 합산)
     * process_view_data의 keywords.final_keywords를 unwind하여 집계
     * money 필드는 String이므로 native aggregation으로 $toDouble 변환
     */
    public List<KeywordSummary> getKeywordStats(String sessionId) {
        log.info("키워드 통계 조회: sessionId={}", sessionId);
        long start = System.currentTimeMillis();

        // Native aggregation pipeline (money가 String이므로 $toDouble 필요)
        List<Document> pipeline = Arrays.asList(
                new Document("$match", new Document("session_id", sessionId)),
                new Document("$addFields", new Document("money_num",
                        new Document("$cond", Arrays.asList(
                                new Document("$eq", Arrays.asList(new Document("$type", "$money"), "string")),
                                new Document("$toDouble", new Document("$ifNull", Arrays.asList("$money", "0"))),
                                new Document("$ifNull", Arrays.asList("$money", 0))
                        ))
                )),
                new Document("$unwind", "$keywords.final_keywords"),
                new Document("$group", new Document("_id", "$keywords.final_keywords")
                        .append("count", new Document("$sum", 1))
                        .append("totalAmount", new Document("$sum", "$money_num"))
                ),
                new Document("$project", new Document("keyword", "$_id")
                        .append("count", 1)
                        .append("totalAmount", 1)
                        .append("_id", 0)
                ),
                new Document("$sort", new Document("count", -1))
        );

        List<Document> results = mongoTemplate.getCollection("process_view_data")
                .aggregate(pipeline)
                .into(new ArrayList<>());

        List<KeywordSummary> stats = results.stream()
                .map(doc -> {
                    Object amountObj = doc.get("totalAmount");
                    double totalAmount = 0;
                    if (amountObj instanceof Number) {
                        totalAmount = ((Number) amountObj).doubleValue();
                    }
                    return KeywordSummary.builder()
                            .keyword(doc.getString("keyword"))
                            .count(doc.getInteger("count", 0))
                            .totalAmount(totalAmount)
                            .build();
                })
                .collect(Collectors.toList());

        log.info("키워드 통계 완료: {}건, {}ms", stats.size(), System.currentTimeMillis() - start);
        return stats;
    }

    /**
     * 키워드 like 검색 (키워드 통계 결과에서 필터)
     */
    public List<KeywordSummary> searchKeywords(String sessionId, String keyword) {
        log.info("키워드 검색: sessionId={}, keyword={}", sessionId, keyword);

        List<Document> pipeline = Arrays.asList(
                new Document("$match", new Document("session_id", sessionId)),
                new Document("$addFields", new Document("money_num",
                        new Document("$cond", Arrays.asList(
                                new Document("$eq", Arrays.asList(new Document("$type", "$money"), "string")),
                                new Document("$toDouble", new Document("$ifNull", Arrays.asList("$money", "0"))),
                                new Document("$ifNull", Arrays.asList("$money", 0))
                        ))
                )),
                new Document("$unwind", "$keywords.final_keywords"),
                new Document("$match", new Document("keywords.final_keywords",
                        new Document("$regex", keyword).append("$options", "i"))),
                new Document("$group", new Document("_id", "$keywords.final_keywords")
                        .append("count", new Document("$sum", 1))
                        .append("totalAmount", new Document("$sum", "$money_num"))
                ),
                new Document("$project", new Document("keyword", "$_id")
                        .append("count", 1)
                        .append("totalAmount", 1)
                        .append("_id", 0)
                ),
                new Document("$sort", new Document("count", -1))
        );

        List<Document> results = mongoTemplate.getCollection("process_view_data")
                .aggregate(pipeline)
                .into(new ArrayList<>());

        return results.stream()
                .map(doc -> {
                    Object amountObj = doc.get("totalAmount");
                    double totalAmount = 0;
                    if (amountObj instanceof Number) {
                        totalAmount = ((Number) amountObj).doubleValue();
                    }
                    return KeywordSummary.builder()
                            .keyword(doc.getString("keyword"))
                            .count(doc.getInteger("count", 0))
                            .totalAmount(totalAmount)
                            .build();
                })
                .collect(Collectors.toList());
    }

    /**
     * 키워드 변환 (여러 from 키워드를 하나의 to 키워드로 치환)
     */
    public Map<String, Object> replaceKeywords(
            String sessionId,
            List<String> fromKeywords,
            String toKeyword
    ) {
        log.info("키워드 변환: {} → {}, sessionId={}", fromKeywords, toKeyword, sessionId);
        long start = System.currentTimeMillis();

        long totalModified = 0;

        for (String fromKeyword : fromKeywords) {
            // fromKeyword를 포함하는 문서를 찾아 toKeyword로 교체
            Query query = new Query(
                    Criteria.where("session_id").is(sessionId)
                            .and("keywords.final_keywords").is(fromKeyword)
            );

            // 1단계: fromKeyword를 toKeyword로 교체
            Update updateReplace = new Update()
                    .set("keywords.final_keywords.$", toKeyword);
            var result = mongoTemplate.updateMulti(query, updateReplace, "process_view_data");
            totalModified += result.getModifiedCount();
        }

        // 2단계: 동일 문서에 중복 toKeyword가 있으면 제거
        // pull all toKeyword, then addToSet toKeyword
        Query dupeQuery = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("keywords.final_keywords").is(toKeyword)
        );
        List<Document> docs = mongoTemplate.find(dupeQuery, Document.class, "process_view_data");
        for (Document doc : docs) {
            @SuppressWarnings("unchecked")
            Document keywords = (Document) doc.get("keywords");
            if (keywords != null) {
                @SuppressWarnings("unchecked")
                List<String> finalKeywords = (List<String>) keywords.get("final_keywords");
                if (finalKeywords != null) {
                    // 중복 제거
                    List<String> deduplicated = finalKeywords.stream()
                            .distinct()
                            .collect(Collectors.toList());
                    if (deduplicated.size() != finalKeywords.size()) {
                        Update dedupUpdate = new Update()
                                .set("keywords.final_keywords", deduplicated);
                        mongoTemplate.updateFirst(
                                new Query(Criteria.where("_id").is(doc.getObjectId("_id"))),
                                dedupUpdate,
                                "process_view_data"
                        );
                    }
                }
            }
        }

        long elapsed = System.currentTimeMillis() - start;
        log.info("키워드 변환 완료: {}건 변경, {}ms", totalModified, elapsed);

        Map<String, Object> resultMap = new HashMap<>();
        resultMap.put("modifiedCount", totalModified);
        resultMap.put("elapsedMs", elapsed);
        return resultMap;
    }

    /**
     * 원본 데이터 조회 (session_data + visible columns, 전체 or 키워드 필터)
     * 키워드 필터: process_view_data에서 해당 키워드를 가진 raw_data_id 목록을 조회 후
     *              session_data에서 해당 raw_data_id에 매칭되는 행을 페이징
     */
    public Map<String, Object> getOriginalData(
            String sessionId, int page, int size, String keyword) {
        log.info("원본 데이터 조회: sessionId={}, page={}, keyword={}", sessionId, page, keyword);
        long start = System.currentTimeMillis();

        // 1. visible columns 조회
        List<ColumnMappingDocument> mappings = columnMappingRepository
                .findBySessionIdOrderBySequenceAsc(sessionId);
        List<String> visibleColumns = mappings.stream()
                .filter(ColumnMappingDocument::getIsVisible)
                .map(ColumnMappingDocument::getOriginalName)
                .collect(Collectors.toList());

        // 2. 키워드 필터가 있으면 해당 raw_data_id 목록 조회
        Set<String> filteredRawDataIds = null;
        if (keyword != null && !keyword.isEmpty()) {
            Query pvQuery = new Query(
                    Criteria.where("session_id").is(sessionId)
                            .and("keywords.final_keywords").is(keyword)
            );
            pvQuery.fields().include("raw_data_id");
            List<Document> pvDocs = mongoTemplate.find(pvQuery, Document.class, "process_view_data");
            filteredRawDataIds = pvDocs.stream()
                    .map(d -> d.getString("raw_data_id"))
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
        }

        // 3. session_data 조회
        Criteria criteria = Criteria.where("session_id").is(sessionId)
                .orOperator(
                        Criteria.where("is_hidden").is(false),
                        Criteria.where("is_hidden").exists(false)
                );

        if (filteredRawDataIds != null) {
            criteria = criteria.and("raw_data_id").in(filteredRawDataIds);
        }

        Query countQuery = new Query(criteria);
        long totalCount = mongoTemplate.count(countQuery, "session_data");

        Query query = new Query(criteria)
                .with(Sort.by("_id"))
                .skip((long) page * size)
                .limit(size);

        List<Document> documents = mongoTemplate.find(query, Document.class, "session_data");

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Document doc : documents) {
            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) doc.get("data");
            if (data != null) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("_id", doc.getObjectId("_id").toString());
                row.put("row_number", doc.getInteger("row_number"));
                // visible columns만 포함
                for (String col : visibleColumns) {
                    row.put(col, data.get(col));
                }
                rows.add(row);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("columns", visibleColumns);
        result.put("data", rows);
        result.put("totalCount", totalCount);
        result.put("page", page);
        result.put("size", size);
        result.put("totalPages", (int) Math.ceil((double) totalCount / size));
        result.put("elapsedMs", System.currentTimeMillis() - start);

        return result;
    }

    /**
     * 검색 결과 데이터 조회 (키워드 변환 탭에서 선택한 키워드 기반)
     * process_view_data에서 해당 키워드를 가진 raw_data_id → session_data 매칭
     */
    public Map<String, Object> getSearchResultData(
            String sessionId, int page, int size, String keyword) {
        return getOriginalData(sessionId, page, size, keyword);
    }

    // ========== DTO ==========

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class KeywordSummary {
        private String keyword;
        private Integer count;
        private Double totalAmount;
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
