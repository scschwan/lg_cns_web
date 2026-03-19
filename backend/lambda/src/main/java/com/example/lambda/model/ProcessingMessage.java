package com.example.lambda.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Excel 처리 메시지 모델 (SQS 전달용)
 *
 * <p>Coordinator Lambda가 Excel 파일을 분석한 뒤, 청크 단위로 분할된
 * 처리 작업 정보를 Worker Lambda에 전달하기 위한 메시지 객체.</p>
 *
 * <p>SQS를 통해 JSON 형태로 직렬화/역직렬화되며,
 * 각 Worker는 이 메시지의 startRow ~ endRow 범위만 처리한다.</p>
 *
 * @see com.example.lambda.coordinator.ExcelCoordinatorHandler 메시지 발행 주체
 * @see com.example.lambda.worker.ExcelWorkerHandler 메시지 소비 주체
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

    /**
     * ⭐ 첫 번째 청크 여부 (Redis 초기화용)
     */
    private boolean isFirstChunk;

    /**
     * ⭐ Coordinator 실행 ID (이전 실행의 SQS 메시지 구분용)
     */
    private String coordinatorRunId;
}
