package com.example.finance.repository;

import com.example.finance.enums.ProcessStep;
import com.example.finance.model.FileSession;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * FileSession Repository
 */
@Repository
public interface FileSessionRepository extends MongoRepository<FileSession, String> {

    /**
     * 세션 ID로 조회
     */
    Optional<FileSession> findBySessionId(String sessionId);

    /**
     * 프로젝트 ID로 세션 목록 조회 (최신순)
     */
    List<FileSession> findByProjectIdAndIsDeletedFalseOrderByCreatedAtDesc(String projectId);

    /**
     * 프로젝트 ID + 완료 여부로 세션 목록 조회
     */
    List<FileSession> findByProjectIdAndIsCompletedAndIsDeletedFalseOrderByCreatedAtDesc(
            String projectId, Boolean isCompleted);

    /**
     * 프로젝트 ID + 현재 단계로 세션 목록 조회
     */
    List<FileSession> findByProjectIdAndCurrentStepAndIsDeletedFalse(
            String projectId, ProcessStep currentStep);

    /**
     * 세션명으로 중복 확인
     */
    boolean existsByProjectIdAndSessionNameAndIsDeletedFalse(
            String projectId, String sessionName);

    /**
     * 프로젝트의 세션 개수 조회
     */
    long countByProjectIdAndIsDeletedFalse(String projectId);

    /**
     * 프로젝트의 완료된 세션 개수 조회
     */
    long countByProjectIdAndIsCompletedTrueAndIsDeletedFalse(String projectId);
}