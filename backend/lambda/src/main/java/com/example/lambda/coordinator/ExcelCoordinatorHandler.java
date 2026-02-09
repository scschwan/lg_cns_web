package com.example.lambda.coordinator;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler; // 변경됨
import com.example.lambda.model.ProcessingMessage;
import com.google.gson.Gson;
import com.google.gson.annotations.SerializedName; // Gson 어노테이션 추가
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamReader;
import java.io.*;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Excel Coordinator Lambda Handler (StAX Streaming + 수동 파싱 Ver)
 * - RequestHandler<S3Event> 대신 RequestStreamHandler 사용 (직렬화 오류 방지)
 * - JSON 직접 파싱을 위한 내부 DTO 클래스 사용
 */
public class ExcelCoordinatorHandler implements RequestStreamHandler {

    static {
        java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Seoul"));
    }

    private static final int CHUNK_SIZE = 50000;
    private static final String SQS_QUEUE_URL = System.getenv("SQS_QUEUE_URL");
    private static final String AWS_REGION = System.getenv("AWS_REGION") != null
            ? System.getenv("AWS_REGION")
            : "ap-northeast-2";

    private final S3Client s3Client;
    private final SqsClient sqsClient;
    private final Gson gson;

    public ExcelCoordinatorHandler() {
        Region region = Region.of(AWS_REGION);
        this.s3Client = S3Client.builder().region(region).build();
        this.sqsClient = SqsClient.builder().region(region).build();
        this.gson = new Gson();
    }

    @Override
    public void handleRequest(InputStream input, OutputStream output, Context context) throws IOException {
        context.getLogger().log("=== [Fix] Excel Coordinator 시작 (Manual Parsing) ===");

        try {
            // 1. InputStream -> String -> DTO 파싱 (런타임 직렬화 우회)
            BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
            S3EventDto event = gson.fromJson(reader, S3EventDto.class);

            if (event.records == null || event.records.isEmpty()) {
                context.getLogger().log("ERROR: 이벤트에 Records가 없습니다. (Test Event 형식 확인 필요)");
                return;
            }

            S3EventDto.S3Record record = event.records.get(0);
            String bucket = record.s3.bucket.name;
            String key = URLDecoder.decode(record.s3.object.key, StandardCharsets.UTF_8);

            context.getLogger().log("S3 파일: bucket=" + bucket + ", key=" + key);

            // 2. 키 파싱
            String[] parts = key.split("/");
            if (parts.length < 7) throw new RuntimeException("잘못된 S3 키 형식: " + key);

            String projectId = parts[1];
            String sessionId = parts[3];
            String uploadId = parts[5];
            String fileName = parts[6];

            // 3. 메타데이터 정밀 분석 (StAX)
            int totalRows = analyzeExcelMetadata(bucket, key, context);

            if (totalRows == 0) {
                context.getLogger().log("데이터가 없는 파일입니다. 종료.");
                return;
            }

            context.getLogger().log("최종 분석된 행 개수: " + totalRows);

            // 4. 청크 발행
            int totalChunks = (int) Math.ceil((double) totalRows / CHUNK_SIZE);
            context.getLogger().log("총 청크 개수: " + totalChunks);

            for (int i = 0; i < totalChunks; i++) {
                int startRow = i * CHUNK_SIZE + 2;
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
                        .isFirstChunk(i == 0)
                        .build();

                sendToSQS(message, context);
            }

            context.getLogger().log("SUCCESS: " + totalChunks + " chunks published");
            output.write(("SUCCESS: " + totalChunks).getBytes(StandardCharsets.UTF_8));

        } catch (Exception e) {
            context.getLogger().log("ERROR: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException(e);
        }
    }

    private int analyzeExcelMetadata(String bucket, String key, Context context) {
        context.getLogger().log("Excel 메타데이터 정밀 분석 시작...");

        try (ResponseInputStream<GetObjectResponse> s3Stream = s3Client.getObject(
                GetObjectRequest.builder().bucket(bucket).key(key).build());
             ZipInputStream zipIn = new ZipInputStream(s3Stream)) {

            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
                if (entry.getName().endsWith("xl/worksheets/sheet1.xml")) {
                    context.getLogger().log("데이터 시트 발견: " + entry.getName());

                    XMLInputFactory factory = XMLInputFactory.newInstance();
                    factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
                    factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);

                    XMLStreamReader xmlReader = factory.createXMLStreamReader(zipIn);
                    int dataRowCount = 0;
                    boolean isRowHasData = false;
                    boolean isInsideRow = false;

                    while (xmlReader.hasNext()) {
                        int event = xmlReader.next();
                        if (event == XMLStreamConstants.START_ELEMENT) {
                            String name = xmlReader.getLocalName();
                            if ("row".equals(name)) {
                                isInsideRow = true;
                                isRowHasData = false;
                            } else if (isInsideRow && ("v".equals(name) || "t".equals(name) || "is".equals(name))) {
                                isRowHasData = true;
                            }
                        } else if (event == XMLStreamConstants.END_ELEMENT) {
                            if ("row".equals(xmlReader.getLocalName())) {
                                if (isRowHasData) dataRowCount++;
                                isInsideRow = false;
                            }
                        }
                    }
                    context.getLogger().log("유효 데이터 행 개수: " + dataRowCount);
                    return dataRowCount > 0 ? dataRowCount - 1 : 0;
                }
            }
        } catch (Exception e) {
            context.getLogger().log("ERROR: 메타데이터 분석 실패: " + e.getMessage());
            throw new RuntimeException("Excel 분석 실패", e);
        }
        throw new RuntimeException("sheet1.xml을 찾을 수 없습니다.");
    }

    private void sendToSQS(ProcessingMessage message, Context context) {
        sqsClient.sendMessage(SendMessageRequest.builder()
                .queueUrl(SQS_QUEUE_URL)
                .messageBody(gson.toJson(message))
                .build());
    }

    // === 내부 DTO 클래스 (Gson 파싱용) ===
    private static class S3EventDto {
        @SerializedName("Records")
        public List<S3Record> records;

        public static class S3Record {
            public S3Object s3;
        }

        public static class S3Object {
            public Bucket bucket;
            public S3Key object;
        }

        public static class Bucket {
            public String name;
        }

        public static class S3Key {
            public String key;
        }
    }
}