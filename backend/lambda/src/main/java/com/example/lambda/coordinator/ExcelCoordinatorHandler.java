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

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamReader;
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
     * 2순위: 파일 크기 기반 추정 (Fallback)
     */
    /**
     * [수정됨] Excel 메타데이터 분석
     * 기존의 Dimension 태그나 파일 크기 추정 대신,
     * XML 스트림을 파싱하여 실제 <row> 태그의 개수를 카운트합니다.
     */
    private int analyzeExcelMetadata(String bucket, String key, Context context) {
        context.getLogger().log("Excel 메타데이터 정밀 분석 시작 (XML StAX Streaming)...");

        try (ResponseInputStream<GetObjectResponse> s3Stream = s3Client.getObject(
                GetObjectRequest.builder().bucket(bucket).key(key).build());
             ZipInputStream zipIn = new ZipInputStream(s3Stream)) {

            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
                // 시트 파일 찾기 (일반적으로 sheet1.xml이 첫 번째 시트)
                if (entry.getName().endsWith("xl/worksheets/sheet1.xml")) {
                    context.getLogger().log("데이터 시트 발견: " + entry.getName());

                    // XML 파서 생성 (보안 설정 포함)
                    XMLInputFactory factory = XMLInputFactory.newInstance();
                    factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
                    factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);

                    // ZipInputStream을 직접 XML 리더로 연결
                    XMLStreamReader reader = factory.createXMLStreamReader(zipIn);

                    int rowCount = 0;

                    // 스트리밍 방식으로 태그 탐색
                    while (reader.hasNext()) {
                        int event = reader.next();
                        // <row> 시작 태그가 나올 때마다 카운트 증가
                        if (event == XMLStreamConstants.START_ELEMENT && "row".equals(reader.getLocalName())) {
                            rowCount++;
                        }
                    }

                    context.getLogger().log("XML 파싱 완료. 실제 데이터 행 개수: " + rowCount);

                    // 헤더(1행)를 제외하고 반환 (데이터가 없으면 0)
                    return rowCount > 0 ? rowCount - 1 : 0;
                }
            }

            context.getLogger().log("WARNING: sheet1.xml을 찾을 수 없습니다.");

        } catch (Exception e) {
            context.getLogger().log("ERROR: 메타데이터 분석 중 오류 발생: " + e.getMessage());
            e.printStackTrace();
        }

        // 실패 시 안전장치 (기존 Fallback 대신 최소값 반환 또는 예외 처리)
        // 여기서는 예외를 던져서 잘못된 청크 생성을 막는 것이 낫습니다.
        throw new RuntimeException("Excel 행 개수를 정확히 분석할 수 없습니다.");
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