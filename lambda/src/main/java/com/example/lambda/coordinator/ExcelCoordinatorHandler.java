package com.example.lambda.coordinator;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.S3Event;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification;
import com.example.lambda.config.RedisConfig;
import com.example.lambda.model.ProcessingMessage;
import com.google.gson.Gson;
import redis.clients.jedis.Jedis;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

/**
 * Excel Coordinator Lambda Handler
 *
 * S3 Event → 메타데이터 분석 (파일 크기 기반 추정) → SQS 메시지 발행
 */
public class ExcelCoordinatorHandler implements RequestHandler<S3Event, String> {

    private static final int CHUNK_SIZE = 100000; // 10만 행씩 분할
    private static final String SQS_QUEUE_URL = System.getenv("SQS_QUEUE_URL");
    private static final String AWS_REGION = System.getenv("AWS_REGION") != null
            ? System.getenv("AWS_REGION")
            : "ap-northeast-2";

    private final S3Client s3Client;
    private final SqsClient sqsClient;
    private final Gson gson;

    public ExcelCoordinatorHandler() {
        Region region = Region.of(AWS_REGION != null ? AWS_REGION : "ap-northeast-2");
        this.s3Client = S3Client.builder().region(region).build();
        this.sqsClient = SqsClient.builder().region(region).build();
        this.gson = new Gson();
    }

    @Override
    public String handleRequest(S3Event s3Event, Context context) {
        context.getLogger().log("=== Excel Coordinator 시작 ===");

        try {
            // 1. S3 Event 파싱
            S3EventNotification.S3EventNotificationRecord record = s3Event.getRecords().get(0);
            String bucket = record.getS3().getBucket().getName();
            String key = record.getS3().getObject().getKey();

            context.getLogger().log("S3 파일: bucket=" + bucket + ", key=" + key);

            // 2. S3 키에서 정보 추출
            // 예: projects/{projectId}/sessions/{sessionId}/uploads/{uploadId}/{fileName}
            String[] parts = key.split("/");
            if (parts.length < 7) {
                throw new RuntimeException("잘못된 S3 키 형식: " + key);
            }

            String projectId = parts[1];
            String sessionId = parts[3];
            String uploadId = parts[5];
            String fileName = parts[6];

            context.getLogger().log("projectId=" + projectId + ", sessionId=" + sessionId +
                    ", uploadId=" + uploadId);

            // 3. Excel 메타데이터 분석 (파일 크기 기반 추정)
            int totalRows = analyzeExcelMetadata(bucket, key, context);

            context.getLogger().log("추정 행 개수: " + totalRows + " (헤더 제외)");

            // 4. Redis 초기화
            initializeRedisStatus(uploadId, totalRows);

            // 5. 청크 분할 및 SQS 메시지 발행
            int totalChunks = (int) Math.ceil((double) totalRows / CHUNK_SIZE);
            context.getLogger().log("총 청크 개수: " + totalChunks);

            for (int i = 0; i < totalChunks; i++) {
                int startRow = i * CHUNK_SIZE + 2; // 1-based, 헤더(1행) 제외
                int endRow = Math.min((i + 1) * CHUNK_SIZE + 1, totalRows + 1);

                ProcessingMessage message = ProcessingMessage.builder()
                        .projectId(projectId)
                        .sessionId(sessionId)
                        .uploadId(uploadId)
                        .s3Bucket(bucket)
                        .s3Key(key)
                        .fileName(fileName)
                        .startRow(startRow)
                        .endRow(endRow)
                        .totalRows(totalRows)
                        .chunkNumber(i + 1)
                        .totalChunks(totalChunks)
                        .build();

                sendToSQS(message, context);

                context.getLogger().log("청크 " + (i + 1) + "/" + totalChunks +
                        " 발행: " + startRow + "~" + endRow);
            }

            context.getLogger().log("=== Excel Coordinator 완료 ===");
            return "SUCCESS: " + totalChunks + " chunks published";

        } catch (Exception e) {
            context.getLogger().log("ERROR: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException(e);
        }
    }

    /**
     * Excel 메타데이터 분석 (파일 크기 기반 추정)
     *
     * ⭐ 전체 파일을 메모리에 로드하지 않음! (메모리 효율)
     */
    private int analyzeExcelMetadata(String bucket, String key, Context context) {
        context.getLogger().log("Excel 메타데이터 분석 시작 (파일 크기 기반)...");

        try {
            // S3 HeadObject로 파일 크기만 조회
            HeadObjectRequest headRequest = HeadObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .build();

            HeadObjectResponse headResponse = s3Client.headObject(headRequest);
            long fileSize = headResponse.contentLength();

            context.getLogger().log("파일 크기: " + fileSize + " bytes (" +
                    (fileSize / 1024 / 1024) + " MB)");

            // 행 개수 추정: 1MB당 약 5,000~10,000행
            // 보수적으로 200 bytes/row 가정
            int estimatedRows = (int) (fileSize / 200);

            context.getLogger().log("추정 행 개수: " + estimatedRows);

            return estimatedRows;

        } catch (Exception e) {
            context.getLogger().log("ERROR: 메타데이터 분석 실패: " + e.getMessage());
            throw new RuntimeException(e);
        }
    }

    /**
     * Redis 상태 초기화
     */
    private void initializeRedisStatus(String uploadId, int totalRows) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            String key = "upload:status:" + uploadId;
            jedis.hset(key, "status", "PROCESSING");
            jedis.hset(key, "progress", "0");
            jedis.hset(key, "totalRows", String.valueOf(totalRows));
            jedis.hset(key, "processedRows", "0");
            jedis.expire(key, 86400); // 24시간 TTL
        }
    }

    /**
     * SQS 메시지 발행
     */
    private void sendToSQS(ProcessingMessage message, Context context) {
        String messageBody = gson.toJson(message);

        SendMessageRequest sendMessageRequest = SendMessageRequest.builder()
                .queueUrl(SQS_QUEUE_URL)
                .messageBody(messageBody)
                .build();

        sqsClient.sendMessage(sendMessageRequest);

        context.getLogger().log("SQS 메시지 발행: uploadId=" + message.getUploadId() +
                ", chunk=" + message.getChunkNumber());
    }
}