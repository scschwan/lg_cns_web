package com.example.finance.repository.upload;

import com.example.finance.model.upload.UploadSession;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 업로드 세션 Repository
 *
 * S3 파일 업로드 추적을 위한 데이터 접근 계층.
 * 업로드 ID, 세션 ID, 프로젝트 ID 기준 조회/삭제 기능을 제공한다.
 */
@Repository
public interface UploadSessionRepository extends MongoRepository<UploadSession, String> {

    Optional<UploadSession> findByUploadId(String uploadId);

    Optional<UploadSession> findBySessionId(String sessionId);

    List<UploadSession> findBySessionIdAndStatus(String sessionId, UploadSession.UploadStatus status);

    List<UploadSession> findByStatusAndCreatedAtBefore(UploadSession.UploadStatus status, LocalDateTime dateTime);

    /**
     * 프로젝트의 업로드 파일 목록 조회
     */
    List<UploadSession> findByProjectIdOrderByCreatedAtDesc(String projectId);

    long countBySessionId(String sessionId);

    /**
     * 세션 ID 기준 업로드 세션 삭제
     */
    void deleteBySessionId(String sessionId);

    /**
     * 업로드 ID 기준 업로드 세션 삭제
     */
    void deleteByUploadId(String uploadId);

    /**
     * 프로젝트 ID 기준 업로드 세션 삭제
     */
    void deleteByProjectId(String projectId);
}