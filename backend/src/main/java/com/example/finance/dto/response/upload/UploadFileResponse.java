package com.example.finance.dto.response.upload;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 파일 업로드 완료 응답
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UploadFileResponse {

    /**
     * 파일 ID (MongoDB ObjectId)
     */
    private String fileId;

    /**
     * 파일명
     */
    private String fileName;

    /**
     * 파일 크기 (bytes)
     */
    private Long fileSize;

    /**
     * S3 키
     */
    private String s3Key;

    /**
     * 업로드 시간
     */
    private LocalDateTime uploadedAt;

    /**
     * 자동 감지된 컬럼 목록
     */
    private List<String> detectedColumns;

    /**
     * 행 개수 (Lambda 처리 후 업데이트)
     */
    private Long rowCount;

    /**
     * 처리 상태
     * - UPLOADED: S3 업로드 완료
     * - PROCESSING: Lambda 파싱 중
     * - COMPLETED: 처리 완료
     * - FAILED: 처리 실패
     */
    private String status;
}