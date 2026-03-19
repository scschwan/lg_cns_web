package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.TaskDocument;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Task 문서 Repository
 *
 * 과제에 첨부된 문서(파일/링크) 데이터에 대한 접근 계층.
 * 과제 ID, 프로젝트 ID 기준 조회/삭제 기능을 제공한다.
 */
@Repository
public interface TaskDocumentRepository extends MongoRepository<TaskDocument, String> {

    List<TaskDocument> findByTaskId(String taskId);

    long countByTaskId(String taskId);

    void deleteByTaskId(String taskId);

    void deleteByProjectId(String projectId);
}
