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
import org.bson.Document;
import redis.clients.jedis.Jedis;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

// ⭐ FastExcel import
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.Row;
import org.dhatim.fastexcel.reader.Sheet;
import org.dhatim.fastexcel.reader.Cell;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Stream;

public class ExcelWorkerHandler implements RequestHandler<SQSEvent, String> {

    private static final int BATCH_SIZE = 20000;
    private static final String AWS_REGION = System.getenv("AWS_REGION") != null
            ? System.getenv("AWS_REGION")
            : "ap-northeast-2";

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

    private void initializeRedisStatus(String uploadId, int totalRows, Context context) {
        int maxRetries = 3;
        int retryDelayMs = 5000;

        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                context.getLogger().log("Redis 초기화 시도: " + attempt + "/" + maxRetries);

                try (Jedis jedis = RedisConfig.getJedis()) {
                    String key = "upload:status:" + uploadId;
                    jedis.hset(key, "status", "PROCESSING");
                    jedis.hset(key, "progress", "0");
                    jedis.hset(key, "totalRows", String.valueOf(totalRows));
                    jedis.hset(key, "processedRows", "0");
                    jedis.expire(key, 86400);

                    context.getLogger().log("Redis 초기화 성공! (시도 " + attempt + ")");
                    return;
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
                    context.getLogger().log("WARNING: Redis 초기화 최종 실패 (진행률 추적 불가, 처리는 계속)");
                }
            }
        }
    }

    /**
     * ⭐ FastExcel 기반 청크 처리 (메모리 효율적!)
     */
    private void processChunk(ProcessingMessage message, Context context) throws IOException {
        Path tempFile = Files.createTempFile("excel-", ".xlsx");

        try {
            context.getLogger().log("S3 다운로드: " + message.getS3Key());

            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                    .bucket(message.getS3Bucket())
                    .key(message.getS3Key())
                    .build();

            // S3 → 파일 다운로드
            try (ResponseInputStream<GetObjectResponse> s3Object = s3Client.getObject(getObjectRequest)) {
                Files.copy(s3Object, tempFile, StandardCopyOption.REPLACE_EXISTING);
                context.getLogger().log("파일 다운로드 완료: " + Files.size(tempFile) + " bytes");
            }

            // ⭐ FastExcel로 스트리밍 읽기 (메모리 20MB 고정!)
            try (ReadableWorkbook workbook = new ReadableWorkbook(tempFile.toFile())) {
                Sheet sheet = workbook.getFirstSheet();

                // 헤더 추출
                Optional<Row> headerRowOpt = sheet.openStream().findFirst();
                if (!headerRowOpt.isPresent()) {
                    context.getLogger().log("WARNING: 빈 시트");
                    return;
                }

                List<String> headers = extractHeaders(headerRowOpt.get());
                context.getLogger().log("헤더: " + headers);

                // MongoDB 준비
                MongoDatabase database = MongoDBConfig.getDatabase();
                MongoCollection<Document> collection = database.getCollection("raw_data");

                List<Document> batch = new ArrayList<>();
                int processedCount = 0;

                // ⭐ 스트리밍 방식으로 행 읽기
                try (Stream<Row> rows = sheet.openStream().skip(1)) { // 헤더 스킵
                    Iterator<Row> rowIterator = rows.iterator();

                    int currentRowIndex = 1; // 0-based (헤더 다음)

                    while (rowIterator.hasNext()) {
                        Row row = rowIterator.next();

                        // 범위 체크
                        if (currentRowIndex < message.getStartRow() - 1) {
                            currentRowIndex++;
                            continue;
                        }

                        if (currentRowIndex >= message.getEndRow()) {
                            break;
                        }

                        // 행 데이터 추출
                        Map<String, Object> rowData = extractRowData(headers, row);

                        // MongoDB Document 생성
                        Document doc = new Document()
                                .append("project_id", message.getProjectId())
                                .append("session_id", message.getSessionId())
                                .append("upload_id", message.getUploadId())
                                .append("row_number", currentRowIndex)
                                .append("data", rowData)
                                .append("is_hidden", false)
                                .append("created_at", LocalDateTime.now().format(dateTimeFormatter))
                                .append("updated_at", LocalDateTime.now().format(dateTimeFormatter));

                        batch.add(doc);

                        // 배치 삽입
                        if (batch.size() >= BATCH_SIZE) {
                            collection.insertMany(batch);
                            processedCount += batch.size();
                            batch.clear();

                            updateProgress(message.getUploadId(), processedCount, message.getTotalRows(), context);
                            context.getLogger().log("중간 저장: " + processedCount + "건 (행: " + currentRowIndex + ")");
                        }

                        currentRowIndex++;
                    }
                }

                // 남은 데이터 삽입
                if (!batch.isEmpty()) {
                    collection.insertMany(batch);
                    processedCount += batch.size();
                    updateProgress(message.getUploadId(), processedCount, message.getTotalRows(), context);
                }

                context.getLogger().log("MongoDB 삽입 완료: " + processedCount + "건");
            }

        } finally {
            try {
                Files.deleteIfExists(tempFile);
                context.getLogger().log("임시 파일 삭제 완료");
            } catch (IOException e) {
                context.getLogger().log("WARNING: 임시 파일 삭제 실패: " + e.getMessage());
            }
        }
    }

    /**
     * FastExcel 헤더 추출
     */
    private List<String> extractHeaders(Row headerRow) {
        List<String> headers = new ArrayList<>();

        for (Cell cell : headerRow) {
            String value = cell.getText();
            headers.add(value != null && !value.isEmpty() ? value : "Column_" + cell.getColumnIndex());
        }

        return headers;
    }

    /**
     * FastExcel 행 데이터 추출
     */
    private Map<String, Object> extractRowData(List<String> headers, Row row) {
        Map<String, Object> data = new LinkedHashMap<>();

        for (int i = 0; i < headers.size(); i++) {
            Optional<Cell> cellOpt = Optional.ofNullable(row.getCell(i));
            String header = headers.get(i);

            Object value = null;
            if (cellOpt.isPresent()) {
                Cell cell = cellOpt.get();
                value = getCellValue(cell);
            }

            data.put(header, value);
        }

        return data;
    }

    /**
     * FastExcel 셀 값 추출
     */
    private Object getCellValue(Cell cell) {
        if (cell == null) {
            return null;
        }

        // FastExcel은 자동으로 타입 변환
        String text = cell.getText();

        if (text == null || text.isEmpty()) {
            return null;
        }

        // 숫자 시도
        try {
            if (text.contains(".")) {
                return Double.parseDouble(text);
            } else {
                return Long.parseLong(text);
            }
        } catch (NumberFormatException e) {
            // 문자열로 반환
            return text;
        }
    }

    private void updateProgress(String uploadId, int processedRows, int totalRows, Context context) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            String key = "upload:status:" + uploadId;

            long currentProcessed = jedis.hincrBy(key, "processedRows", processedRows);
            int progress = (int) ((currentProcessed * 100.0) / totalRows);
            jedis.hset(key, "progress", String.valueOf(progress));

            context.getLogger().log("진행률 업데이트: " + progress + "% (" + currentProcessed + "/" + totalRows + ")");

            if (currentProcessed >= totalRows) {
                jedis.hset(key, "status", "COMPLETED");
                context.getLogger().log("파싱 완료!");
            }
        } catch (Exception e) {
            context.getLogger().log("WARNING: Redis 진행률 업데이트 실패: " + e.getMessage());
        }
    }
}