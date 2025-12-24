package com.example.finance.repository.data;

import com.example.finance.model.data.ClusteringResult;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * ClusteringResult Repository
 */
@Repository
public interface ClusteringResultRepository extends MongoRepository<ClusteringResult, String> {

    /**
     * 세션 ID로 클러스터 결과 목록 조회
     */
    List<ClusteringResult> findBySessionIdOrderByClusterIdAsc(String sessionId);

    /**
     * 세션 ID + 클러스터 ID로 조회
     */
    Optional<ClusteringResult> findBySessionIdAndClusterId(String sessionId, Integer clusterId);

    /**
     * 프로젝트 ID + 세션 ID로 클러스터 결과 목록 조회
     */
    List<ClusteringResult> findByProjectIdAndSessionId(String projectId, String sessionId);

    /**
     * 세션의 모든 클러스터 결과 삭제
     */
    void deleteBySessionId(String sessionId);

    /**
     * 프로젝트 + 세션의 모든 클러스터 결과 삭제
     */
    void deleteByProjectIdAndSessionId(String projectId, String sessionId);
}