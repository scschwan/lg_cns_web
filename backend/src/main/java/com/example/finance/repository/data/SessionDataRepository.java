package com.example.finance.repository.data;

import com.example.finance.model.data.SessionDataDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SessionDataRepository extends MongoRepository<SessionDataDocument, String> {

    Page<SessionDataDocument> findBySessionId(String sessionId, Pageable pageable);

    List<SessionDataDocument> findBySessionId(String sessionId);

    long countBySessionId(String sessionId);

    long countBySessionIdAndUploadId(String sessionId, String uploadId);

    void deleteBySessionId(String sessionId);

    boolean existsBySessionId(String sessionId);

    Page<SessionDataDocument> findByRawDataIdIn(List<String> rawDataIds, Pageable pageable);

    long countByRawDataIdIn(List<String> rawDataIds);

    // ── cluster_statistics ID 기반 조회 (raw-data 최적화) ──

    Page<SessionDataDocument> findByStatsL2Id(String statsL2Id, Pageable pageable);

    long countByStatsL2Id(String statsL2Id);

    Page<SessionDataDocument> findByStatsL3Id(String statsL3Id, Pageable pageable);

    long countByStatsL3Id(String statsL3Id);

    Page<SessionDataDocument> findByStatsL2IdIn(List<String> statsL2Ids, Pageable pageable);

    long countByStatsL2IdIn(List<String> statsL2Ids);
}
