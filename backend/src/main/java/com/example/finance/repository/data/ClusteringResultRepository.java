package com.example.finance.repository.data;

import com.example.finance.model.data.ClusteringResult;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * ClusteringResult Repository (Step 5)
 */
@Repository
public interface ClusteringResultRepository extends MongoRepository<ClusteringResult, String> {

    /**
     * 세션의 모든 클러스터 조회 (cluster_number 오름차순)
     */
    List<ClusteringResult> findBySessionIdOrderByClusterNumberAsc(String sessionId);

    /**
     * 세션의 미병합 클러스터 조회 (cluster_id == -1)
     */
    List<ClusteringResult> findBySessionIdAndClusterIdOrderByClusterNumberAsc(String sessionId, Integer clusterId);

    /**
     * 세션의 미병합 클러스터 페이징 조회
     */
    Page<ClusteringResult> findBySessionIdAndClusterId(String sessionId, Integer clusterId, Pageable pageable);

    /**
     * 세션 + cluster_number로 단일 조회 (중복 방어: 첫 번째만 반환)
     */
    Optional<ClusteringResult> findFirstBySessionIdAndClusterNumber(String sessionId, Integer clusterNumber);

    /**
     * 세션의 cluster_number 목록에 해당하는 클러스터 조회
     */
    List<ClusteringResult> findBySessionIdAndClusterNumberIn(String sessionId, List<Integer> clusterNumbers);

    /**
     * 병합 클러스터 목록 조회 (cluster_id == -1이고 하위 클러스터가 있는 것들)
     * → 실제로는 cluster_id == -1인 클러스터 중, 다른 클러스터의 cluster_id가 자기 cluster_number인 것
     * → 서비스 레이어에서 처리
     */

    /**
     * 세션의 최대 cluster_number 조회용 (서비스에서 MongoTemplate으로 처리)
     */

    /**
     * 세션의 모든 클러스터 삭제
     */
    void deleteBySessionId(String sessionId);

    /**
     * 세션의 클러스터 수 카운트
     */
    long countBySessionId(String sessionId);

    /**
     * 세션의 미병합 클러스터 수 카운트
     */
    long countBySessionIdAndClusterId(String sessionId, Integer clusterId);
}
