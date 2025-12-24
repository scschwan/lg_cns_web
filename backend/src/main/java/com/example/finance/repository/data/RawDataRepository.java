package com.example.finance.repository.data;

import com.example.finance.model.data.RawDataDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

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
}