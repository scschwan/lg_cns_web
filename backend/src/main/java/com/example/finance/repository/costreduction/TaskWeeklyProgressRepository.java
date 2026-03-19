package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.TaskWeeklyProgress;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

/**
 * 주간 진척 Repository
 *
 * 과제별 주간 진척 기록 데이터에 대한 접근 계층.
 * 과제 ID, 프로젝트 ID 기준 조회/삭제 기능을 제공한다.
 */
public interface TaskWeeklyProgressRepository extends MongoRepository<TaskWeeklyProgress, String> {

    List<TaskWeeklyProgress> findByTaskIdOrderByCreatedAtDesc(String taskId);

    List<TaskWeeklyProgress> findByTaskIdOrderByCreatedAtAsc(String taskId);

    void deleteByTaskId(String taskId);

    void deleteByProjectId(String projectId);

    long countByTaskId(String taskId);
}
