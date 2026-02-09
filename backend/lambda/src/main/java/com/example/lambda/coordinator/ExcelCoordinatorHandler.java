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

import java.io.IOException;
import java.net.URLDecoder;
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

    // ★ 한국 시간대(KST) 설정
    static {
        java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Seoul"));
    }

    private static final int CHUNK_SIZE = 50000; // 5만 행씩 분할 (1M rows = 20 chunks)
    private static final int EXCEL_MAX_ROWS = 1048576; // Excel 최대 행 수 (2^20)
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
            // ★ S3 Event는 키를 URL 인코딩하여 전달 → 디코딩 필수
            String key = URLDecoder.decode(
                    record.getS3().getObject().getKey(), StandardCharsets.UTF_8);

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
     * 2순위: XML <row r="N"> 스캔 (Dimension이 Excel 최대값일 때)
     * 3순위: 파일 크기 기반 추정 (Fallback)
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

                    // 앞부분 2KB(2048 바이트)만 읽어서 Dimension 태그 확인
                    byte[] buffer = new byte[2048];
                    int bytesRead = 0;

                    int len;
                    while (bytesRead < buffer.length && (len = zipIn.read(buffer, bytesRead, buffer.length - bytesRead)) != -1) {
                        bytesRead += len;
                    }

                    if (bytesRead > 0) {
                        String xmlHeader = new String(buffer, 0, bytesRead, StandardCharsets.UTF_8);

                        Pattern pattern = Pattern.compile("<dimension\\s+ref=\"[A-Z]+[0-9]+:[A-Z]+([0-9]+)\"");
                        Matcher matcher = pattern.matcher(xmlHeader);

                        if (matcher.find()) {
                            String rowsStr = matcher.group(1);
                            int rowCount = Integer.parseInt(rowsStr);
                            context.getLogger().log("Dimension 태그 발견! 행 개수: " + rowCount);

                            // ★ Excel 최대값(1,048,576)이면 실제 데이터가 아닌 서식 범위
                            // → XML row 스캔으로 실제 마지막 행 번호 찾기
                            if (rowCount >= EXCEL_MAX_ROWS) {
                                context.getLogger().log("⚠️ Dimension이 Excel 최대값 (" + EXCEL_MAX_ROWS +
                                        ") → 서식 범위. XML row 스캔으로 실제 행 수 확인...");

                                // ⭐ 이미 읽은 2KB + 나머지 XML 전체를 스캔하여 실제 마지막 row 번호 찾기
                                int actualRows = scanActualLastRow(xmlHeader, zipIn, context);
                                if (actualRows > 0) {
                                    context.getLogger().log("★ XML row 스캔 성공! 실제 행 수: " + actualRows);
                                    return actualRows - 1; // 헤더 제외
                                }

                                context.getLogger().log("XML row 스캔 실패, 파일 크기 추정으로 전환");
                                break; // fallbackEstimate로 이동
                            }

                            return rowCount > 0 ? rowCount - 1 : 0;
                        }
                    }

                    context.getLogger().log("WARNING: 앞부분 2KB에서 Dimension 태그를 찾지 못함. Fallback 실행.");
                    break;
                }
            }
        } catch (Exception e) {
            context.getLogger().log("ERROR: Dimension 분석 실패 (" + e.getClass().getSimpleName() + "): " + e.getMessage());
        }

        return fallbackEstimate(bucket, key, context);
    }

    /**
     * ⭐ XML <row r="N"> 스캔으로 실제 마지막 행 번호 찾기
     *
     * xlsx XML에서 데이터 행은 <row r="123" ...> 형태로 기록됨.
     * 전체 XML을 64KB 청크로 스트리밍 읽기하면서 마지막 row 번호를 추적.
     * 메모리 사용: 약 64KB (Lambda 512MB 대비 무시 가능)
     *
     * @param alreadyRead 이미 읽은 XML 헤더 (2KB)
     * @param zipIn       sheet1.xml의 나머지 데이터 스트림
     * @return 마지막 행 번호 (1-based), 실패 시 -1
     */
    private int scanActualLastRow(String alreadyRead, ZipInputStream zipIn, Context context) {
        try {
            Pattern rowPattern = Pattern.compile("<row\\s+r=\"(\\d+)\"");
            int maxRow = 0;
            long startTime = System.currentTimeMillis();

            // 1. 이미 읽은 2KB에서 먼저 검색
            Matcher m = rowPattern.matcher(alreadyRead);
            while (m.find()) {
                int rowNum = Integer.parseInt(m.group(1));
                if (rowNum > maxRow) maxRow = rowNum;
            }

            // 2. 나머지 XML을 64KB 청크로 스트리밍 읽기
            byte[] buf = new byte[65536]; // 64KB
            String leftover = ""; // 청크 경계에서 잘린 태그를 위한 버퍼
            long totalBytesRead = 0;

            int bytesRead;
            while ((bytesRead = zipIn.read(buf)) != -1) {
                totalBytesRead += bytesRead;
                String chunk = leftover + new String(buf, 0, bytesRead, StandardCharsets.UTF_8);

                // <row r="N"> 패턴 검색
                Matcher matcher = rowPattern.matcher(chunk);
                while (matcher.find()) {
                    int rowNum = Integer.parseInt(matcher.group(1));
                    if (rowNum > maxRow) maxRow = rowNum;
                }

                // 청크 경계에서 태그가 잘릴 수 있으므로 마지막 50자를 leftover로 보관
                if (chunk.length() > 50) {
                    leftover = chunk.substring(chunk.length() - 50);
                } else {
                    leftover = chunk;
                }

                // 100MB마다 진행 상황 로그 + 90초 타임아웃 안전장치
                if (totalBytesRead % (100 * 1024 * 1024) < 65536) {
                    long elapsed = System.currentTimeMillis() - startTime;
                    context.getLogger().log("XML 스캔 진행: " + (totalBytesRead / 1024 / 1024) +
                            "MB 읽음, 현재 maxRow=" + maxRow + ", 경과=" + (elapsed / 1000) + "초");

                    // 90초 초과 시 현재까지 찾은 결과 반환 (Lambda 120초 타임아웃 대비)
                    if (elapsed > 90000 && maxRow > 0) {
                        context.getLogger().log("⚠️ 스캔 타임아웃 (90초), 현재까지 maxRow=" + maxRow + " 사용");
                        return maxRow;
                    }
                }
            }

            long elapsed = System.currentTimeMillis() - startTime;
            context.getLogger().log("XML row 스캔 완료: totalBytesRead=" + (totalBytesRead / 1024) +
                    "KB, maxRow=" + maxRow + ", 소요시간=" + (elapsed / 1000) + "초");

            return maxRow > 0 ? maxRow : -1;

        } catch (Exception e) {
            context.getLogger().log("ERROR: XML row 스캔 실패: " + e.getMessage());
            return -1;
        }
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

            // 50바이트당 1행으로 추정 (보수적: 빈 청크는 Worker가 0건 처리 후 즉시 종료)
            int estimatedRows = (int) Math.max(fileSize / 50, 1000);
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