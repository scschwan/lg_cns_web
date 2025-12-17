package com.example.finance.repository;

import com.example.finance.model.Project;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 프로젝트 Repository
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Repository
public interface ProjectRepository extends MongoRepository<Project, String> {

    Optional<Project> findByProjectId(String projectId);

    List<Project> findByProjectIdIn(List<String> projectIds);

    List<Project> findByOwnerId(String ownerId);
}