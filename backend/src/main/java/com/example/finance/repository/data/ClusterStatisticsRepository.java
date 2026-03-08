package com.example.finance.repository.data;

import com.example.finance.model.data.ClusterStatistics;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface ClusterStatisticsRepository extends MongoRepository<ClusterStatistics, String> {

    List<ClusterStatistics> findBySessionId(String sessionId);

    List<ClusterStatistics> findBySessionIdAndLevel(String sessionId, Integer level);

    List<ClusterStatistics> findBySessionIdAndParentClusterNumber(String sessionId, Integer parentClusterNumber);

    void deleteBySessionId(String sessionId);

    List<ClusterStatistics> findByProjectId(String projectId);

    List<ClusterStatistics> findByProjectIdAndLevel(String projectId, Integer level);

    List<ClusterStatistics> findBySessionIdIn(List<String> sessionIds);
}
