package com.example.finance.repository.data;

import com.example.finance.model.data.RawDataDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * RawData Repository
 */
@Repository
public interface RawDataRepository extends MongoRepository<RawDataDocument, String> {

    /**
     * 세션 ID로 페이징 조회
     */
    Page<RawDataDocument> findBySessionId(String sessionId, Pageable pageable);

    /**
     * 프로젝트 ID + 세션 ID로 페이징 조회
     */
    Page<RawDataDocument> findByProjectIdAndSessionId(
            String projectId, String sessionId, Pageable pageable);

    /**
     * 세션의 총 개수 조회
     */
    long countBySessionId(String sessionId);

    /**
     * 프로젝트 + 세션의 총 개수 조회
     */
    long countByProjectIdAndSessionId(String projectId, String sessionId);

    /**
     * 세션의 모든 데이터 삭제 (초기화)
     */
    void deleteBySessionId(String sessionId);

    /**
     * 프로젝트 + 세션의 모든 데이터 삭제
     */
    void deleteByProjectIdAndSessionId(String projectId, String sessionId);

    /**
     * 세션별 전체 조회 (페이징 없음, 병렬 처리용)
     */
    List<RawDataDocument> findBySessionId(String sessionId);

    /**
     * 세션별 전체 조회 (프로젝트 필터)
     */
    List<RawDataDocument> findByProjectIdAndSessionId(String projectId, String sessionId);

    /**
     * 세션별 데이터 필드 내부 값으로 필터링
     * 예: data.거래처명 = "ABC상사"
     *
     * MongoDB Query:
     * { "session_id": "...", "data.거래처명": "ABC상사" }
     */
    @Query("{ 'session_id': ?0, 'data.?1': ?2 }")
    List<RawDataDocument> findBySessionIdAndDataField(
            String sessionId,
            String fieldName,
            Object fieldValue
    );

    /**
     * 세션별 특정 필드 IN 쿼리
     * 예: data.거래처명 IN ["ABC상사", "XYZ기업"]
     *
     * MongoDB Query:
     * { "session_id": "...", "data.거래처명": { $in: [...] } }
     */
    @Query("{ 'session_id': ?0, 'data.?1': { $in: ?2 } }")
    List<RawDataDocument> findBySessionIdAndDataFieldIn(
            String sessionId,
            String fieldName,
            List<String> fieldValues
    );

    /**
     * 세션별 특정 필드 고유값 추출 (Aggregation 필요)
     * Service에서 MongoTemplate 사용
     */
}