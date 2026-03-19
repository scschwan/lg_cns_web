package com.example.finance.repository.data;

import com.example.finance.model.data.ClusterStatistics;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

/**
 * 클러스터 통계 Repository
 *
 * cluster_statistics 컬렉션에 대한 데이터 접근 계층.
 * 세션/프로젝트 기준, 계층 레벨(level) 기준 조회 기능을 제공한다.
 */
public interface ClusterStatisticsRepository extends MongoRepository<ClusterStatistics, String> {

    List<ClusterStatistics> findBySessionId(String sessionId);

    List<ClusterStatistics> findBySessionIdAndLevel(String sessionId, Integer level);

    List<ClusterStatistics> findBySessionIdAndParentClusterNumber(String sessionId, Integer parentClusterNumber);

    void deleteBySessionId(String sessionId);

    List<ClusterStatistics> findByProjectId(String projectId);

    List<ClusterStatistics> findByProjectIdAndLevel(String projectId, Integer level);

    List<ClusterStatistics> findBySessionIdIn(List<String> sessionIds);
}
