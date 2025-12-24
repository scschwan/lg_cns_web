package com.example.finance.model;

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
 * 업로드 세션 모델
 *
 * MongoDB 컬렉션: upload_sessions
 */
@Document(collection = "upload_sessions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UploadSession {

    @Id
    private String id;

    /**
     * 프로젝트 ID
     */
    @Field("project_id")
    private String projectId;

    /**
     * 세션 ID
     */
    @Indexed(unique = true)
    @Field("session_id")
    private String sessionId;

    /**
     * 업로드 ID
     */
    @Indexed(unique = true)
    @Field("upload_id")
    private String uploadId;

    /**
     * S3 버킷
     */
    @Field("s3_bucket")
    private String s3Bucket;

    /**
     * S3 키
     */
    @Field("s3_key")
    private String s3Key;

    /**
     * 파일명
     */
    @Field("file_name")
    private String fileName;

    /**
     * 파일 크기
     */
    @Field("file_size")
    private Long fileSize;

    /**
     * 업로드 상태
     */
    private UploadStatus status;

    /**
     * 진행률 (0-100)
     */
    private Integer progress;

    /**
     * 총 행 수
     */
    @Field("total_rows")
    private Integer totalRows;

    /**
     * 처리된 행 수
     */
    @Field("processed_rows")
    private Integer processedRows;

    /**
     * 에러 메시지
     */
    @Field("error_message")
    private String errorMessage;

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
     * 완료 시간
     */
    @Field("completed_at")
    private LocalDateTime completedAt;

    /**
     * 업로드 상태 Enum
     */
    public enum UploadStatus {
        PENDING,      // 대기 중
        UPLOADING,    // 업로드 중
        PROCESSING,   // 처리 중
        COMPLETED,    // 완료
        FAILED        // 실패
    }
}