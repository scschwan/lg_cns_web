package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.AbleTask;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AbleTaskRepository extends MongoRepository<AbleTask, String> {

    List<AbleTask> findByProjectId(String projectId);

    List<AbleTask> findByProjectIdAndStatus(String projectId, String status);

    long countByProjectId(String projectId);

    long countByProjectIdAndStatus(String projectId, String status);
}
