package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.TaskDocument;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TaskDocumentRepository extends MongoRepository<TaskDocument, String> {

    List<TaskDocument> findByTaskId(String taskId);

    long countByTaskId(String taskId);

    void deleteByTaskId(String taskId);
}
