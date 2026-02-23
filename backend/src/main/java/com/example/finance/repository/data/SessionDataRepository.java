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
}
