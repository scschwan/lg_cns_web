package com.example.lambda.worker;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import com.example.lambda.config.MongoDBConfig;
import com.example.lambda.config.RedisConfig;
import com.example.lambda.model.ProcessingMessage;
import com.google.gson.Gson;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.monitorjbl.xlsx.StreamingReader;
import org.apache.poi.openxml4j.exceptions.InvalidFormatException;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.util.IOUtils;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.bson.Document;
import redis.clients.jedis.Jedis;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Excel Worker Lambda Handler
 *
 * SQS 메시지 수신 → Excel 파싱 → MongoDB 삽입
 */
public class ExcelWorkerHandler implements RequestHandler<SQSEvent, String> {

    private static final int BATCH_SIZE = 20000; // MongoDB 배치 삽입 크기
    private static final String AWS_REGION = System.getenv("AWS_REGION") != null
            ? System.getenv("AWS_REGION")
            : "ap-northeast-2";

    // ⭐ Apache POI 메모리 제한 해제 (static 초기화)
    static {
        IOUtils.setByteArrayMaxOverride(Integer.MAX_VALUE);
    }

    private final S3Client s3Client;
    private final Gson gson;
    private final DateTimeFormatter dateTimeFormatter;

    public ExcelWorkerHandler() {
        Region region = Region.of(AWS_REGION != null ? AWS_REGION : "ap-northeast-2");
        this.s3Client = S3Client.builder().region(region).build();
        this.gson = new Gson();
        this.dateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    }

    @Override
    public String handleRequest(SQSEvent sqsEvent, Context context) {
        context.getLogger().log("=== Excel Worker 시작 ===");

        try {
            for (SQSEvent.SQSMessage message : sqsEvent.getRecords()) {
                String messageBody = message.getBody();
                ProcessingMessage processingMessage = gson.fromJson(messageBody, ProcessingMessage.class);

                context.getLogger().log("처리 시작: uploadId=" + processingMessage.getUploadId() +
                        ", chunk=" + processingMessage.getChunkNumber() +
                        ", rows=" + processingMessage.getStartRow() + "~" +
                        processingMessage.getEndRow() +
                        (processingMessage.isFirstChunk() ? " (첫 청크 - Redis 초기화)" : ""));

                // ⭐ 첫 번째 청크인 경우 Redis 초기화
                if (processingMessage.isFirstChunk()) {
                    initializeRedisStatus(
                            processingMessage.getUploadId(),
                            processingMessage.getTotalRows(),
                            context
                    );
                }

                processChunk(processingMessage, context);

                context.getLogger().log("처리 완료: chunk=" + processingMessage.getChunkNumber());
            }

            context.getLogger().log("=== Excel Worker 완료 ===");
            return "SUCCESS";

        } catch (Exception e) {
            context.getLogger().log("ERROR: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException(e);
        }
    }

    /**
     * ⭐ Redis 상태 초기화 (첫 번째 Worker만 실행)
     */
    private void initializeRedisStatus(String uploadId, int totalRows, Context context) {
        int maxRetries = 3;
        int retryDelayMs = 5000; // 5초

        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                context.getLogger().log("Redis 초기화 시도: " + attempt + "/" + maxRetries);

                try (Jedis jedis = RedisConfig.getJedis()) {
                    String key = "upload:status:" + uploadId;
                    jedis.hset(key, "status", "PROCESSING");
                    jedis.hset(key, "progress", "0");
                    jedis.hset(key, "totalRows", String.valueOf(totalRows));
                    jedis.hset(key, "processedRows", "0");
                    jedis.expire(key, 86400); // 24시간 TTL

                    context.getLogger().log("Redis 초기화 성공! (시도 " + attempt + ")");
                    return; // 성공 시 즉시 반환
                }

            } catch (Exception e) {
                context.getLogger().log("Redis 초기화 실패 (시도 " + attempt + "): " + e.getMessage());

                if (attempt < maxRetries) {
                    context.getLogger().log(retryDelayMs + "ms 후 재시도...");
                    try {
                        Thread.sleep(retryDelayMs);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                } else {
                    // ⚠️ 3회 실패 시 경고만 기록 (처리는 계속)
                    context.getLogger().log("WARNING: Redis 초기화 최종 실패 (진행률 추적 불가, 처리는 계속)");
                }
            }
        }
    }

    /**
     * 청크 처리
     */
    private void processChunk(ProcessingMessage message, Context context) throws IOException {
        // 1. 임시 파일 경로 생성
        Path tempFile = Files.createTempFile("excel-", ".xlsx");

        try {
            context.getLogger().log("S3 다운로드: " + message.getS3Key());
            // ... (S3 다운로드 로직은 기존과 동일) ...
            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                    .bucket(message.getS3Bucket())
                    .key(message.getS3Key())
                    .build();

            try (ResponseInputStream<GetObjectResponse> s3Object = s3Client.getObject(getObjectRequest)) {
                Files.copy(s3Object, tempFile, StandardCopyOption.REPLACE_EXISTING);
                context.getLogger().log("파일 다운로드 완료: " + Files.size(tempFile) + " bytes");
            }

            // ⭐ [수정] StreamingReader 사용 (메모리 절약)
            // StreamingReader는 전체 파일을 로드하지 않고 스트리밍 방식으로 읽습니다.
            try (Workbook workbook = StreamingReader.builder()
                    .rowCacheSize(100)    // 메모리에 유지할 행의 수 (적을수록 메모리 절약)
                    .bufferSize(4096)     // 버퍼 사이즈
                    .open(tempFile.toFile())) { // 파일에서 읽기

                Sheet sheet = workbook.getSheetAt(0);

                // 2. 헤더 추출 및 데이터 파싱
                MongoDatabase database = MongoDBConfig.getDatabase();
                MongoCollection<Document> collection = database.getCollection("raw_data");

                List<Document> batch = new ArrayList<>();
                int processedCount = 0;
                List<String> headers = null;

                // ⭐ StreamingReader는 getRow(i)를 지원하지 않으므로 for-each 사용
                int currentRowIndex = 0;

                for (Row row : sheet) {
                    // 2-1. 헤더 추출 (0번째 행)
                    if (currentRowIndex == 0) {
                        headers = extractHeaders(row);
                        context.getLogger().log("헤더 추출 완료: " + headers);
                        currentRowIndex++;
                        continue;
                    }

                    // 2-2. 처리할 범위 이전의 행은 스킵 (Skip)
                    // (스트리밍 방식이라 앞부분도 읽으면서 지나가야 합니다)
                    if (currentRowIndex < message.getStartRow() - 1) { // startRow는 1-based, index는 0-based라 가정 시 조정 필요 (여기선 헤더 제외 후 데이터 기준인지 확인 필요. 보통 엑셀 행번호 기준이면 헤더가 0번)
                        currentRowIndex++;
                        continue;
                    }

                    // 2-3. 처리할 범위를 벗어나면 중단 (Break)
                    if (currentRowIndex >= message.getEndRow()) {
                        break;
                    }

                    // 2-4. 데이터 처리
                    // (row가 null인 경우는 스트리밍에서 거의 없으나 체크)
                    if (row != null) {
                        Map<String, Object> rowData = extractRowData(headers, row);

                        Document doc = new Document()
                                .append("project_id", message.getProjectId())
                                .append("session_id", message.getSessionId())
                                .append("upload_id", message.getUploadId())
                                .append("row_number", currentRowIndex) // 현재 행 번호
                                .append("data", rowData)
                                .append("is_hidden", false)
                                .append("created_at", LocalDateTime.now().format(dateTimeFormatter))
                                .append("updated_at", LocalDateTime.now().format(dateTimeFormatter));

                        batch.add(doc);
                    }

                    // 배치 저장
                    if (batch.size() >= BATCH_SIZE) {
                        collection.insertMany(batch);
                        processedCount += batch.size();
                        batch.clear();
                        updateProgress(message.getUploadId(), processedCount, message.getTotalRows(), context);
                        // 로그 양이 너무 많으면 람다 비용 증가하므로 배수마다 로깅
                        context.getLogger().log("중간 저장: " + processedCount + "건 (Row " + currentRowIndex + ")");
                    }

                    currentRowIndex++;
                }

                // 남은 데이터 저장
                if (!batch.isEmpty()) {
                    collection.insertMany(batch);
                    processedCount += batch.size();
                    updateProgress(message.getUploadId(), processedCount, message.getTotalRows(), context);
                }

                context.getLogger().log("MongoDB 삽입 완료: " + processedCount + "건");
            }

        } catch (Exception e) { // InvalidFormatException 등 포함
            context.getLogger().log("ERROR processing chunk: " + e.getMessage());
            throw new RuntimeException(e);
        } finally {
            // 4. 임시 파일 삭제
            try {
                Files.deleteIfExists(tempFile);
                context.getLogger().log("임시 파일 삭제 완료");
            } catch (IOException e) {
                context.getLogger().log("WARNING: 임시 파일 삭제 실패: " + e.getMessage());
            }
        }
    }

    /**
     * 헤더 추출 (그대로 사용)
     */
    private List<String> extractHeaders(Row headerRow) {
        List<String> headers = new ArrayList<>();
        for (Cell cell : headerRow) {
            String header = getCellValueAsString(cell);
            headers.add(header != null ? header : "Column_" + cell.getColumnIndex());
        }
        return headers;
    }

    /**
     * 행 데이터 추출
     */
    private Map<String, Object> extractRowData(List<String> headers, Row row) {
        Map<String, Object> data = new LinkedHashMap<>();

        for (int i = 0; i < headers.size(); i++) {
            Cell cell = row.getCell(i);
            String header = headers.get(i);
            Object value = getCellValue(cell);
            data.put(header, value);
        }

        return data;
    }

    /**
     * 셀 값 추출 (타입별 처리)
     */
    private Object getCellValue(Cell cell) {
        if (cell == null) {
            return null;
        }

        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();

            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getLocalDateTimeCellValue().format(dateTimeFormatter);
                } else {
                    return cell.getNumericCellValue();
                }

            case BOOLEAN:
                return cell.getBooleanCellValue();

            case FORMULA:
                return cell.getCellFormula();

            case BLANK:
                return null;

            default:
                return cell.toString();
        }
    }

    /**
     * 셀 값을 문자열로 추출
     */
    private String getCellValueAsString(Cell cell) {
        Object value = getCellValue(cell);
        return value != null ? value.toString() : null;
    }

    /**
     * Redis 진행률 업데이트
     */
    private void updateProgress(String uploadId, int processedRows, int totalRows, Context context) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            String key = "upload:status:" + uploadId;

            // 원자적 증가
            long currentProcessed = jedis.hincrBy(key, "processedRows", processedRows);

            // 진행률 계산
            int progress = (int) ((currentProcessed * 100.0) / totalRows);
            jedis.hset(key, "progress", String.valueOf(progress));

            context.getLogger().log("진행률 업데이트: " + progress + "% (" + currentProcessed + "/" + totalRows + ")");

            // 완료 확인
            if (currentProcessed >= totalRows) {
                jedis.hset(key, "status", "COMPLETED");
                context.getLogger().log("파싱 완료!");
            }
        } catch (Exception e) {
            // Redis 업데이트 실패 시 경고만 기록 (처리는 계속)
            context.getLogger().log("WARNING: Redis 진행률 업데이트 실패: " + e.getMessage());
        }
    }
}