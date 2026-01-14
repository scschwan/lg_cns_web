package com.example.finance.service.data;

import com.example.finance.model.data.RawDataDocument;
import com.example.finance.repository.data.RawDataRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * RawData 조회 서비스 (Step 2)
 *
 * ⭐ 병렬 처리 최적화
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RawDataService {

    private final RawDataRepository rawDataRepository;
    private final MongoTemplate mongoTemplate;

    /**
     * 세션별 페이징 조회 (Step 2 UI)
     */
    public Page<RawDataDocument> getSessionData(
            String sessionId,
            int page,
            int size,
            String sortBy,
            String sortDirection
    ) {
        Sort sort = Sort.by(
                "desc".equalsIgnoreCase(sortDirection) ? Sort.Direction.DESC : Sort.Direction.ASC,
                sortBy != null ? sortBy : "createdAt"
        );

        Pageable pageable = PageRequest.of(page - 1, size, sort);
        return rawDataRepository.findBySessionId(sessionId, pageable);
    }

    /**
     * 세션별 전체 데이터 조회 (병렬 처리용)
     *
     * ⚠️ 메모리 주의: 대용량 데이터 시 배치 처리 필요
     */
    public List<RawDataDocument> getAllSessionData(String sessionId) {
        log.info("Loading all data for session: {}", sessionId);
        return rawDataRepository.findBySessionId(sessionId);
    }

    /**
     * 세션 데이터 카운트
     */
    public long countSessionData(String sessionId) {
        return rawDataRepository.countBySessionId(sessionId);
    }

    /**
     * 세션별 특정 필드 고유값 추출 (Aggregation)
     *
     * C# 원본: AnalyzeAccountPartitionsAsync()
     *
     * 예: "거래처명" 컬럼의 고유값 추출
     */
    public Set<String> extractUniqueFieldValues(
            String sessionId,
            String fieldName
    ) {
        Aggregation aggregation = Aggregation.newAggregation(
                // 1. 세션 필터링
                Aggregation.match(Criteria.where("session_id").is(sessionId)),

                // 2. data 필드 언팩
                Aggregation.project().and("data." + fieldName).as("value"),

                // 3. 그룹핑
                Aggregation.group("value"),

                // 4. 정렬
                Aggregation.sort(Sort.Direction.ASC, "_id")
        );

        AggregationResults<org.bson.Document> results = mongoTemplate.aggregate(
                aggregation,
                "raw_data",
                org.bson.Document.class
        );

        return results.getMappedResults().stream()
                .map(doc -> doc.getString("_id"))
                .filter(val -> val != null && !val.isEmpty())
                .collect(Collectors.toSet());
    }

    /**
     * 세션별 금액 합계 계산
     *
     * MongoDB Aggregation Pipeline
     */
    public Long calculateTotalAmount(
            String sessionId,
            String amountFieldName
    ) {
        Aggregation aggregation = Aggregation.newAggregation(
                // 1. 세션 필터링
                Aggregation.match(Criteria.where("session_id").is(sessionId)),

                // 2. 금액 필드 추출 및 변환
                Aggregation.project()
                        .and("data." + amountFieldName).as("amount"),

                // 3. 합계
                Aggregation.group()
                        .sum("amount").as("totalAmount")
        );

        AggregationResults<org.bson.Document> results = mongoTemplate.aggregate(
                aggregation,
                "raw_data",
                org.bson.Document.class
        );

        List<org.bson.Document> docs = results.getMappedResults();
        if (docs.isEmpty()) {
            return 0L;
        }

        Object totalAmount = docs.get(0).get("totalAmount");
        if (totalAmount instanceof Number) {
            return ((Number) totalAmount).longValue();
        }

        return 0L;
    }

    /**
     * 세션 데이터 삭제
     */
    public void deleteSessionData(String sessionId) {
        log.warn("Deleting all data for session: {}", sessionId);
        rawDataRepository.deleteBySessionId(sessionId);
    }
}