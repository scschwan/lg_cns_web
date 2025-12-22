package com.example.finance.repository;

import com.example.finance.model.Project;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Project Repository (v2.0)
 */
@Repository
public interface ProjectRepository extends MongoRepository<Project, String> {

    /**
     * 프로젝트 ID로 조회
     */
    Optional<Project> findByProjectId(String projectId);

    /**
     * 프로젝트 ID 목록으로 조회
     */
    List<Project> findByProjectIdIn(List<String> projectIds);

    /**
     * 생성자 ID로 프로젝트 목록 조회
     */
    List<Project> findByCreatedByAndIsDeletedFalseOrderByCreatedAtDesc(String createdBy);

    /**
     * 멤버 user_id로 프로젝트 목록 조회 (임베디드 배열 검색)
     */
    List<Project> findByMembersUserIdAndIsDeletedFalse(String userId);

    /**
     * 프로젝트명 중복 확인
     */
    boolean existsByProjectNameAndCreatedByAndIsDeletedFalse(String projectName, String createdBy);
}