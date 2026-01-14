package com.example.finance.repository.data;

import com.example.finance.model.data.ProcessViewData;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * ProcessViewData Repository
 */
@Repository
public interface ProcessViewDataRepository extends MongoRepository<ProcessViewData, String> {

    /**
     * 세션별 조회
     */
    List<ProcessViewData> findBySessionId(String sessionId);

    /**
     * 세션 + 프로젝트 조회
     */
    List<ProcessViewData> findByProjectIdAndSessionId(String projectId, String sessionId);

    /**
     * 세션별 개수
     */
    long countBySessionId(String sessionId);

    /**
     * 세션별 삭제
     */
    void deleteBySessionId(String sessionId);
}