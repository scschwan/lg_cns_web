package com.example.finance.model;

import com.example.finance.enums.ProcessStep;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 파일 세션 모델 (작업 세션)
 *
 * MongoDB 컬렉션: file_sessions
 *
 * Phase 2: 비즈니스 로직 구현
 */
@Document(collection = "file_sessions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@CompoundIndex(name = "project_session_idx", def = "{'project_id': 1, 'session_id': 1}")
@CompoundIndex(name = "project_created_idx", def = "{'project_id': 1, 'created_at': -1}")
@CompoundIndex(name = "project_step_idx", def = "{'project_id': 1, 'current_step': 1}")
public class FileSession {

    @Id
    private String id;

    /**
     * 세션 ID (UUID)
     */
    @Indexed(unique = true)
    @Field("session_id")
    private String sessionId;

    /**
     * 프로젝트 ID
     */
    @Indexed
    @Field("project_id")
    private String projectId;

    /**
     * 세션명 (사용자 편집 가능)
     */
    @Field("session_name")
    private String sessionName;

    /**
     * 작업자명 (사용자 편집 가능)
     */
    @Field("worker_name")
    private String workerName;

    /**
     * 생성자 ID (User._id)
     */
    @Field("created_by")
    private String createdBy;

    /**
     * 생성 시간
     */
    @Field("created_at")
    private LocalDateTime createdAt;

    /**
     * 수정 시간
     */
    @Field("updated_at")
    private LocalDateTime updatedAt;

    /**
     * 마지막 접근 시간
     */
    @Field("last_accessed_at")
    private LocalDateTime lastAccessedAt;

    /**
     * 업로드된 파일 정보 목록
     */
    @Field("uploaded_files")
    @Builder.Default
    private List<UploadedFileInfo> uploadedFiles = new ArrayList<>();

    /**
     * 총 파일 수
     */
    @Field("total_files")
    @Builder.Default
    private Integer totalFiles = 0;

    /**
     * 총 행 수
     */
    @Field("total_row_count")
    @Builder.Default
    private Long totalRowCount = 0L;

    /**
     * 합산 금액
     */
    @Field("total_amount")
    @Builder.Default
    private Long totalAmount = 0L;

    // ⭐⭐⭐ 진행 상태 관리 ⭐⭐⭐

    /**
     * 현재 진행 단계
     */
    @Field("current_step")
    private ProcessStep currentStep;

    /**
     * 진행률 (0~100)
     */
    @Field("progress_percentage")
    @Builder.Default
    private Integer progressPercentage = 0;

    /**
     * 단계별 이력
     */
    @Field("step_history")
    @Builder.Default
    private List<StepHistory> stepHistory = new ArrayList<>();

    /**
     * 완료 여부
     */
    @Indexed
    @Field("is_completed")
    @Builder.Default
    private Boolean isCompleted = false;

    /**
     * 완료 시간
     */
    @Field("completed_at")
    private LocalDateTime completedAt;

    /**
     * Export 파일 경로 (S3)
     */
    @Field("export_path")
    private String exportPath;

    /**
     * 계정명 값 목록 (병합 시 여러 개)
     */
    @Field("account_names")
    @Builder.Default
    private List<String> accountNames = new ArrayList<>();

    /**
     * 계정명 컬럼명 목록
     */
    @Field("account_column_names")
    @Builder.Default
    private List<String> accountColumnNames = new ArrayList<>();

    /**
     * 삭제 여부
     */
    @Field("is_deleted")
    @Builder.Default
    private Boolean isDeleted = false;
}