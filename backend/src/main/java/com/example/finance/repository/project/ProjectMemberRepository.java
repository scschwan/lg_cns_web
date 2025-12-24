package com.example.finance.repository.project;

import com.example.finance.model.project.ProjectMember;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 프로젝트 멤버 Repository
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Repository
public interface ProjectMemberRepository extends MongoRepository<ProjectMember, String> {

    Optional<ProjectMember> findByProjectIdAndUserId(String projectId, String userId);

    List<ProjectMember> findByUserId(String userId);

    List<ProjectMember> findByProjectId(String projectId);

    boolean existsByProjectIdAndUserId(String projectId, String userId);

    int countByProjectId(String projectId);
}