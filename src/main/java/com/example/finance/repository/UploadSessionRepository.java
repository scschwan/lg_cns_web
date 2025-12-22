package com.example.finance.repository;

import com.example.finance.model.UploadSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface UploadSessionRepository extends MongoRepository<UploadSession, String> {

    Optional<UploadSession> findByUploadId(String uploadId);

    Page<UploadSession> findBySessionId(String sessionId, Pageable pageable);

    List<UploadSession> findBySessionIdAndStatus(String sessionId, UploadSession.UploadStatus status);

    List<UploadSession> findByStatusAndCreatedAtBefore(UploadSession.UploadStatus status, LocalDateTime dateTime);

    /**
     * 프로젝트의 업로드 파일 목록 조회
     */
    List<UploadSession> findByProjectIdOrderByCreatedAtDesc(String projectId);

    long countBySessionId(String sessionId);
}