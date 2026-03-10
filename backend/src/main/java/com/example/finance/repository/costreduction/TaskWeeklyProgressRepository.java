package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.TaskWeeklyProgress;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface TaskWeeklyProgressRepository extends MongoRepository<TaskWeeklyProgress, String> {

    List<TaskWeeklyProgress> findByTaskIdOrderByCreatedAtDesc(String taskId);

    List<TaskWeeklyProgress> findByTaskIdOrderByCreatedAtAsc(String taskId);

    void deleteByTaskId(String taskId);

    void deleteByProjectId(String projectId);

    long countByTaskId(String taskId);
}
