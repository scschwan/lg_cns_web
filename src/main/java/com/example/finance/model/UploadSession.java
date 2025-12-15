package com.example.finance.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "upload_sessions")
public class UploadSession {

    @Id
    private String id;

    private String sessionId;       // 사용자 세션 ID
    private String uploadId;        // 업로드 고유 ID
    private String fileName;        // 원본 파일명
    private Long fileSize;          // 파일 크기 (bytes)
    private String s3Bucket;        // S3 버킷명
    private String s3Key;           // S3 객체 키

    private UploadStatus status;    // 업로드 상태
    private Integer totalRows;      // 전체 행 개수
    private Integer processedRows;  // 처리된 행 개수
    private Integer progress;       // 진행률 (0-100)

    private String errorMessage;    // 에러 메시지

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime completedAt;

    public enum UploadStatus {
        PENDING,        // 업로드 대기
        UPLOADING,      // 업로드 중
        UPLOADED,       // 업로드 완료
        PROCESSING,     // 파싱 중
        COMPLETED,      // 처리 완료
        FAILED          // 실패
    }
}