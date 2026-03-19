package com.example.finance.model.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;

/**
 * 과제 첨부 문서 모델
 *
 * MongoDB 컬렉션: task_documents
 *
 * 과제에 첨부된 파일(S3) 또는 링크(URL) 정보를 관리한다.
 */
@Document(collection = "task_documents")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskDocument {

    @Id
    private String id;

    @Indexed
    @Field("task_id")
    private String taskId;

    @Field("project_id")
    private String projectId;

    @Field("type")
    private String type; // "link" or "file"

    @Field("name")
    private String name;

    @Field("label")
    private String label;

    @Field("url")
    private String url;

    @Field("s3_key")
    private String s3Key;

    @Field("created_at")
    private LocalDateTime createdAt;
}
