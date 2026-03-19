package com.example.lambda.coordinator;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.example.lambda.model.ProcessingMessage;
import com.google.gson.Gson;
import com.google.gson.annotations.SerializedName;
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
 * Excel 파일 분할 처리 Coordinator Lambda Handler
 *
 * <p>S3에 업로드된 Excel(.xlsx) 파일의 메타데이터(행 수)를 StAX 방식으로 분석한 뒤,
 * 데이터를 청크 단위로 분할하여 SQS를 통해 Worker Lambda에 작업을 분배한다.</p>
 *
 * <p>처리 흐름:</p>
 * <ol>
 *   <li>S3 이벤트 수신 (파일 업로드 트리거)</li>
 *   <li>Excel 파일의 sheet1.xml을 StAX로 파싱하여 실제 데이터 행 수 카운트</li>
 *   <li>빈 행(phantom rows) 제외 - {@code <v>} 또는 {@code <is>} 태그가 있는 행만 카운트</li>
 *   <li>청크 크기(50,000행)로 분할하여 SQS에 ProcessingMessage 발행</li>
 * </ol>
 *
 * <p>S3 키 구조: projects/{projectId}/sessions/{sessionId}/uploads/{uploadId}/{fileName}</p>
 *
 * @see ExcelWorkerHandler 실제 데이터 처리를 수행하는 Worker Lambda
 * @see ProcessingMessage Coordinator와 Worker 간 전달 메시지 모델
 */
public class ExcelCoordinatorHandler implements RequestStreamHandler {

    /** JVM 시간대를 한국 시간(KST)으로 설정 */
    static {
        java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Seoul"));
    }

    /** 하나의 청크에 포함할 최대 행 수 */
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

    /**
     * S3 이벤트를 수신하여 Excel 파일을 분석하고 청크별 SQS 메시지를 발행한다
     *
     * @param input   S3 이벤트 JSON (Records 배열 포함)
     * @param output  처리 결과 출력 스트림
     * @param context Lambda 실행 컨텍스트
     * @throws IOException 입출력 예외
     */
    @Override
    public void handleRequest(InputStream input, OutputStream output, Context context) throws IOException {
        context.getLogger().log("=== [Fix v2] Excel Coordinator 시작 (Data Rows Only) ===");

        try {
            BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
            S3EventDto event = gson.fromJson(reader, S3EventDto.class);

            if (event.records == null || event.records.isEmpty()) {
                context.getLogger().log("ERROR: 이벤트에 Records가 없습니다.");
                return;
            }

            S3EventDto.S3Record record = event.records.get(0);
            String bucket = record.s3.bucket.name;
            String key = URLDecoder.decode(record.s3.object.key, StandardCharsets.UTF_8);

            context.getLogger().log("S3 파일: bucket=" + bucket + ", key=" + key);

            String[] parts = key.split("/");
            String projectId = parts[1];
            String sessionId = parts[3];
            String uploadId = parts[5];
            String fileName = parts[6];

            // 3. 메타데이터 분석 (모든 행 카운트)
            int totalRows = analyzeExcelMetadata(bucket, key, context);

            if (totalRows == 0) {
                context.getLogger().log("데이터 행이 0개입니다. (헤더만 있거나 비어있음)");
                // 0개라도 진행이 필요하다면 아래 return을 제거하세요.
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

            String result = "SUCCESS: " + totalChunks + " chunks";
            output.write(result.getBytes(StandardCharsets.UTF_8));

        } catch (Exception e) {
            context.getLogger().log("ERROR: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException(e);
        }
    }

    /**
     * Excel 파일의 실제 데이터 행 수를 StAX 방식으로 분석한다
     *
     * <p>ZIP 내부의 xl/worksheets/sheet1.xml을 스트리밍 파싱하여
     * {@code <v>} 또는 {@code <is>} 태그가 있는 행만 카운트한다.
     * 헤더(1행)를 제외한 순수 데이터 행 수를 반환한다.</p>
     *
     * @param bucket S3 버킷명
     * @param key    S3 객체 키
     * @param context Lambda 실행 컨텍스트
     * @return 데이터 행 수 (헤더 제외)
     */
    private int analyzeExcelMetadata(String bucket, String key, Context context) {
        context.getLogger().log("Excel 행 개수 분석 시작 (값이 있는 행만 카운트)...");

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
                    int rowCount = 0;
                    int totalPhysicalRows = 0;
                    boolean rowHasValue = false;

                    while (xmlReader.hasNext()) {
                        int event = xmlReader.next();

                        if (event == XMLStreamConstants.START_ELEMENT) {
                            String name = xmlReader.getLocalName();
                            if ("row".equals(name)) {
                                // 새 행 시작: 값 존재 플래그 초기화
                                rowHasValue = false;
                            } else if ("v".equals(name) || "is".equals(name)) {
                                // <v> = 셀 값, <is> = 인라인 문자열 → 데이터 있는 행
                                rowHasValue = true;
                            }
                        } else if (event == XMLStreamConstants.END_ELEMENT && "row".equals(xmlReader.getLocalName())) {
                            totalPhysicalRows++;
                            if (rowHasValue) {
                                rowCount++;
                            }
                        }
                    }

                    context.getLogger().log("물리적 행 개수(헤더 포함): " + totalPhysicalRows);
                    context.getLogger().log("데이터 존재 행 개수(헤더 포함): " + rowCount);
                    int skipped = totalPhysicalRows - rowCount;
                    if (skipped > 0) {
                        context.getLogger().log("빈 행(phantom rows) 제외: " + skipped + "건");
                    }
                    // 헤더(1행) 제외하고 반환
                    return rowCount > 0 ? rowCount - 1 : 0;
                }
            }
        } catch (Exception e) {
            context.getLogger().log("ERROR: 메타데이터 분석 실패: " + e.getMessage());
            throw new RuntimeException("Excel 분석 실패", e);
        }
        throw new RuntimeException("sheet1.xml을 찾을 수 없습니다.");
    }

    /**
     * 청크 처리 메시지를 SQS 큐에 발행한다
     *
     * @param message 처리 메시지 (청크 범위, 파일 정보 포함)
     * @param context Lambda 실행 컨텍스트
     */
    private void sendToSQS(ProcessingMessage message, Context context) {
        sqsClient.sendMessage(SendMessageRequest.builder()
                .queueUrl(SQS_QUEUE_URL)
                .messageBody(gson.toJson(message))
                .build());
    }

    /** S3 이벤트 알림 JSON을 매핑하기 위한 내부 DTO 클래스 */
    private static class S3EventDto {
        @SerializedName("Records")
        public List<S3Record> records;
        public static class S3Record { public S3Object s3; }
        public static class S3Object { public Bucket bucket; public S3Key object; }
        public static class Bucket { public String name; }
        public static class S3Key { public String key; }
    }
}