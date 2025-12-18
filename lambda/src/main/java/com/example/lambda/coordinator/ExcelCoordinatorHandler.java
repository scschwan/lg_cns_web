package com.example.lambda.coordinator;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.S3Event;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification;
import com.example.lambda.model.ProcessingMessage;
import com.google.gson.Gson;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Excel Coordinator Lambda Handler
 *
 * S3 Event → 메타데이터 분석 (Dimension 태그 우선, 실패 시 파일 크기 추정) → SQS 메시지 발행
 */
public class ExcelCoordinatorHandler implements RequestHandler<S3Event, String> {

    //private static final int CHUNK_SIZE = 100000; // 10만 행씩 분할
    private static final int CHUNK_SIZE = 2000; // 10만 행씩 분할
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

            // 3. Excel 메타데이터 분석 (Dimension 방식 우선)
            int totalRows = analyzeExcelMetadata(bucket, key, context);

            context.getLogger().log("최종 분석된 행 개수: " + totalRows + " (헤더 제외)");

            // 4. 청크 분할 및 SQS 메시지 발행
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
                        .isFirstChunk(i == 0) // ⭐ 첫 번째 청크 표시
                        .build();

                sendToSQS(message, context);

                context.getLogger().log("청크 " + (i + 1) + "/" + totalChunks +
                        " 발행: " + startRow + "~" + endRow +
                        (message.isFirstChunk() ? " (첫 청크 - Redis 초기화)" : ""));
            }

            context.getLogger().log("=== Excel Coordinator 완료 (즉시!) ===");
            return "SUCCESS: " + totalChunks + " chunks published";

        } catch (Exception e) {
            context.getLogger().log("ERROR: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException(e);
        }
    }

    /**
     * Excel 메타데이터 분석
     * 1순위: XML Dimension 태그 분석 (정확, 빠름)
     * 2순위: 파일 크기 기반 추정 (Fallback)
     */
    private int analyzeExcelMetadata(String bucket, String key, Context context) {
        context.getLogger().log("Excel 메타데이터 분석 시작 (Dimension 태그 방식)...");

        try (ResponseInputStream<GetObjectResponse> s3Stream = s3Client.getObject(
                GetObjectRequest.builder().bucket(bucket).key(key).build());
             ZipInputStream zipIn = new ZipInputStream(s3Stream)) {

            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
                if (entry.getName().endsWith("xl/worksheets/sheet1.xml")) {

                    context.getLogger().log("시트 발견: " + entry.getName());

                    // ⭐ [수정] readLine() 제거!
                    // 무조건 앞부분 2KB(2048 바이트)만 읽어서 String으로 변환
                    byte[] buffer = new byte[2048];
                    int bytesRead = 0;

                    // 루프를 돌며 버퍼가 찰 때까지 읽음 (네트워크 패킷 분할 고려)
                    int len;
                    while (bytesRead < buffer.length && (len = zipIn.read(buffer, bytesRead, buffer.length - bytesRead)) != -1) {
                        bytesRead += len;
                    }

                    if (bytesRead > 0) {
                        String xmlHeader = new String(buffer, 0, bytesRead, StandardCharsets.UTF_8);

                        // 정규식으로 태그 찾기
                        Pattern pattern = Pattern.compile("<dimension\\s+ref=\"[A-Z]+[0-9]+:[A-Z]+([0-9]+)\"");
                        Matcher matcher = pattern.matcher(xmlHeader);

                        if (matcher.find()) {
                            String rowsStr = matcher.group(1);
                            int rowCount = Integer.parseInt(rowsStr);
                            context.getLogger().log("Dimension 태그 발견! 행 개수: " + rowCount);

                            return rowCount > 0 ? rowCount - 1 : 0;
                        }
                    }

                    context.getLogger().log("WARNING: 앞부분 2KB에서 Dimension 태그를 찾지 못함. Fallback 실행.");
                    break; // 못 찾으면 Fallback
                }
            }
        } catch (Exception e) {
            context.getLogger().log("ERROR: Dimension 분석 실패 (" + e.getClass().getSimpleName() + "): " + e.getMessage());
        }

        // 실패 시 안전장치
        return fallbackEstimate(bucket, key, context);
    }

    /**
     * Fallback: 파일 크기 기반 추정 (기존 로직)
     * Dimension 태그를 못 찾았을 때 실행됨
     */
    private int fallbackEstimate(String bucket, String key, Context context) {
        context.getLogger().log("⚠️ Dimension 분석 실패. 파일 크기 기반 추정(Fallback) 시작...");
        try {
            HeadObjectRequest headRequest = HeadObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .build();

            HeadObjectResponse headResponse = s3Client.headObject(headRequest);
            long fileSize = headResponse.contentLength();

            context.getLogger().log("파일 크기: " + fileSize + " bytes");

            // 200바이트당 1행으로 추정
            int estimatedRows = (int) (fileSize / 200);
            context.getLogger().log("추정 행 개수 (Fallback): " + estimatedRows);

            return estimatedRows;

        } catch (Exception e) {
            context.getLogger().log("ERROR: Fallback 추정 실패: " + e.getMessage());
            throw new RuntimeException("메타데이터 분석 및 추정 모두 실패", e);
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