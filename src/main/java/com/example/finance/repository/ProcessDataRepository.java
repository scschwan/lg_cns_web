package com.example.finance.repository;

import com.example.finance.model.ProcessDataDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * ProcessData Repository
 */
@Repository
public interface ProcessDataRepository extends MongoRepository<ProcessDataDocument, String> {

    /**
     * 세션 ID로 페이징 조회
     */
    Page<ProcessDataDocument> findBySessionId(String sessionId, Pageable pageable);

    /**
     * 프로젝트 ID + 세션 ID로 페이징 조회
     */
    Page<ProcessDataDocument> findByProjectIdAndSessionId(
            String projectId, String sessionId, Pageable pageable);

    /**
     * 세션 ID + 클러스터 ID로 조회
     */
    List<ProcessDataDocument> findBySessionIdAndClusterId(String sessionId, Integer clusterId);

    /**
     * 세션 ID + 숨김 여부로 조회
     */
    Page<ProcessDataDocument> findBySessionIdAndIsHidden(
            String sessionId, Boolean isHidden, Pageable pageable);

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