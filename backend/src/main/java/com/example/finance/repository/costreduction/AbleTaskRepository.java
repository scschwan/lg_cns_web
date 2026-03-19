package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.AbleTask;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Able Task(원가절감 과제) Repository
 *
 * 프로젝트별 원가절감 과제 데이터에 대한 접근 계층.
 * 프로젝트 ID, 상태 기준 조회/카운트/삭제 기능을 제공한다.
 */
@Repository
public interface AbleTaskRepository extends MongoRepository<AbleTask, String> {

    List<AbleTask> findByProjectId(String projectId);

    List<AbleTask> findByProjectIdAndStatus(String projectId, String status);

    long countByProjectId(String projectId);

    long countByProjectIdAndStatus(String projectId, String status);

    void deleteByProjectId(String projectId);
}
