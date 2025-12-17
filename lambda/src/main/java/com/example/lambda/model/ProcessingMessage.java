package com.example.lambda.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Excel 처리 메시지 (SQS)
 *
 * Coordinator → Worker 전달
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProcessingMessage {

    /**
     * 프로젝트 ID
     */
    private String projectId;

    /**
     * 세션 ID
     */
    private String sessionId;

    /**
     * 업로드 ID
     */
    private String uploadId;

    /**
     * S3 버킷
     */
    private String s3Bucket;

    /**
     * S3 키
     */
    private String s3Key;

    /**
     * 파일명
     */
    private String fileName;

    /**
     * 시작 행 (1-based)
     */
    private int startRow;

    /**
     * 종료 행 (1-based, inclusive)
     */
    private int endRow;

    /**
     * 총 행 수
     */
    private int totalRows;

    /**
     * 청크 번호
     */
    private int chunkNumber;

    /**
     * 총 청크 수
     */
    private int totalChunks;
}
