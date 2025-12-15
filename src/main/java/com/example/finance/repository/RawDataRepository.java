package com.example.finance.repository;

import com.example.finance.model.RawDataDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface RawDataRepository extends MongoRepository<RawDataDocument, String> {

    // sessionId로 조회
    List<RawDataDocument> findBySessionId(String sessionId);

    // sessionId로 페이징 조회
    Page<RawDataDocument> findBySessionId(String sessionId, Pageable pageable);

    // sessionId 개수
    long countBySessionId(String sessionId);

    // uploadId로 조회
    List<RawDataDocument> findByUploadId(String uploadId);

    // uploadId 개수
    long countByUploadId(String uploadId);

    // 날짜 범위로 조회
    List<RawDataDocument> findByCreatedAtBetween(LocalDateTime start, LocalDateTime end);

    // sessionId와 날짜 범위
    @Query("{ 'sessionId': ?0, 'createdAt': { $gte: ?1, $lte: ?2 } }")
    List<RawDataDocument> findBySessionIdAndDateRange(String sessionId, LocalDateTime start, LocalDateTime end);

    // sessionId로 삭제
    void deleteBySessionId(String sessionId);

    // uploadId로 삭제
    void deleteByUploadId(String uploadId);
}