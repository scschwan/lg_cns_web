package com.example.finance.repository.data;

import com.example.finance.model.data.ColumnMappingDocument;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 컬럼 매핑 Repository
 *
 * column_mapping 컬렉션에 대한 데이터 접근 계층.
 * 세션별 컬럼 가시성, 순서, 이름 관리 기능을 제공한다.
 */
@Repository
public interface ColumnMappingRepository extends MongoRepository<ColumnMappingDocument, String> {

    List<ColumnMappingDocument> findBySessionIdOrderBySequenceAsc(String sessionId);

    Optional<ColumnMappingDocument> findBySessionIdAndOriginalName(String sessionId, String originalName);

    long countBySessionId(String sessionId);

    void deleteBySessionId(String sessionId);
}
