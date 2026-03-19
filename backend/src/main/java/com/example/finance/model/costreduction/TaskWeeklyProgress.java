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
 * 주간 진척 모델
 *
 * MongoDB 컬렉션: task_weekly_progress
 *
 * 과제별 주간 단위 진행 내역, 이슈, 작성자 정보를 관리한다.
 */
@Document(collection = "task_weekly_progress")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskWeeklyProgress {

    @Id
    private String id;

    @Indexed
    @Field("task_id")
    private String taskId;

    @Indexed
    @Field("project_id")
    private String projectId;

    @Field("week_number")
    private String weekNumber;

    @Field("progress_details")
    private String progressDetails;

    @Field("issues")
    private String issues;

    @Field("author")
    private String author;

    @Field("created_at")
    private LocalDateTime createdAt;

    @Field("updated_at")
    private LocalDateTime updatedAt;
}
