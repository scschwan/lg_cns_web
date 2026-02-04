package com.example.finance.repository.data;

import com.example.finance.model.data.ColumnMappingDocument;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ColumnMappingRepository extends MongoRepository<ColumnMappingDocument, String> {

    List<ColumnMappingDocument> findBySessionIdOrderBySequenceAsc(String sessionId);

    Optional<ColumnMappingDocument> findBySessionIdAndOriginalName(String sessionId, String originalName);

    long countBySessionId(String sessionId);

    void deleteBySessionId(String sessionId);
}
