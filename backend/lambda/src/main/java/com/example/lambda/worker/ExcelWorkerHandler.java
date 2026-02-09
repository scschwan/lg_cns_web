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
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.util.IOUtils;
import org.bson.Document;
import redis.clients.jedis.Jedis;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
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

    // ⭐ Apache POI 메모리 제한 해제 + 한국 시간대 설정 (static 초기화)
    static {
        IOUtils.setByteArrayMaxOverride(Integer.MAX_VALUE);
        java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Seoul"));
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

                // ★ 청크 완료 마킹 (chunk 기반 진행률 추적)
                markChunkCompleted(processingMessage, context);

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
                    jedis.hset(key, "completedChunks", "0");
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
        // 1. /tmp에 임시 파일 다운로드
        Path tempFile = Files.createTempFile("excel-", ".xlsx");

        try {
            // S3 키 URL 디코딩
            String s3Key = message.getS3Key();
            try {
                String decoded = URLDecoder.decode(s3Key, java.nio.charset.StandardCharsets.UTF_8);
                if (!decoded.equals(s3Key)) {
                    context.getLogger().log("S3 키 URL 디코딩: " + s3Key + " → " + decoded);
                    s3Key = decoded;
                }
            } catch (Exception e) {
                context.getLogger().log("URL 디코딩 스킵: " + e.getMessage());
            }

            context.getLogger().log("S3 다운로드: " + s3Key);

            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                    .bucket(message.getS3Bucket())
                    .key(s3Key)
                    .build();

            try (ResponseInputStream<GetObjectResponse> s3Object = s3Client.getObject(getObjectRequest)) {
                Files.copy(s3Object, tempFile, StandardCopyOption.REPLACE_EXISTING);
                context.getLogger().log("파일 다운로드 완료: " + Files.size(tempFile) + " bytes");
            }

            // 2. Streaming Reader로 Excel 열기 (메모리 효율화)
            try (InputStream inputStream = new FileInputStream(tempFile.toFile());
                 Workbook workbook = StreamingReader.builder()
                         .rowCacheSize(100)
                         .bufferSize(4096)
                         .open(inputStream)) {

                Sheet sheet = workbook.getSheetAt(0);

                // 3. 헤더 추출
                Iterator<Row> rowIterator = sheet.iterator();
                if (!rowIterator.hasNext()) {
                    context.getLogger().log("WARNING: 빈 시트");
                    return;
                }

                Row headerRow = rowIterator.next();
                List<String> headers = extractHeaders(headerRow);

                // 4. MongoDB 준비
                MongoDatabase database = MongoDBConfig.getDatabase();
                MongoCollection<Document> collection = database.getCollection("raw_data");

                // [수정됨] ★ 멱등성 보장: Insert 전, 해당 청크 범위의 기존 데이터 삭제
                // 기존의 countDocuments 체크는 동시성 이슈로 중복을 막지 못하므로 삭제 후 삽입 방식을 사용합니다.
                // startRow는 1-based 엑셀 행 번호, DB의 row_number는 (실제 행 - 1) 로직을 따르고 있으므로 범위 조정
                long deletedCount = collection.deleteMany(
                        Filters.and(
                                Filters.eq("upload_id", message.getUploadId()),
                                Filters.gte("row_number", message.getStartRow() - 1),
                                Filters.lt("row_number", message.getEndRow())
                        )
                ).getDeletedCount();

                if (deletedCount > 0) {
                    context.getLogger().log("⚠️ 재시도 감지: 기존 데이터 " + deletedCount + "건 삭제 후 재처리 (Chunk " + message.getChunkNumber() + ")");
                }

                List<Document> batch = new ArrayList<>();
                int processedCount = 0;
                int currentRowIndex = 1; // 헤더 다음부터 (0-based 데이터 인덱스)

                // 5. 스트리밍 방식으로 행 읽기
                while (rowIterator.hasNext()) {
                    Row row = rowIterator.next();

                    // startRow ~ endRow 범위만 처리 (Skip Logic)
                    if (currentRowIndex < message.getStartRow() - 1) {
                        currentRowIndex++;
                        continue; // 앞부분 건너뛰기
                    }

                    if (currentRowIndex >= message.getEndRow()) {
                        break; // 범위 벗어나면 종료
                    }

                    // 행 데이터 추출
                    Map<String, Object> rowData = extractRowDataStreaming(headers, row);

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
                        int batchCount = batch.size();
                        processedCount += batchCount;
                        batch.clear();

                        // Redis 진행률 업데이트
                        updateProgress(message.getUploadId(), batchCount, message.getTotalRows(), context);

                        // 로그를 너무 자주 남기면 CloudWatch 비용 증가하므로 주석 처리하거나 배치 단위로만 기록
                        // context.getLogger().log("중간 저장: " + processedCount + "건");
                    }

                    currentRowIndex++;
                }

                // 남은 데이터 삽입
                if (!batch.isEmpty()) {
                    collection.insertMany(batch);
                    int batchCount = batch.size();
                    processedCount += batchCount;
                    updateProgress(message.getUploadId(), batchCount, message.getTotalRows(), context);
                }

                context.getLogger().log("MongoDB 삽입 완료: " + processedCount + "건 (Chunk " + message.getChunkNumber() + ")");
            }

        } finally {
            // 6. 임시 파일 삭제
            try {
                Files.deleteIfExists(tempFile);
            } catch (IOException e) {
                context.getLogger().log("WARNING: 임시 파일 삭제 실패: " + e.getMessage());
            }
        }
    }

    /**
     * Streaming Reader용 행 데이터 추출
     */
    private Map<String, Object> extractRowDataStreaming(List<String> headers, Row row) {
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
     * Streaming Reader용 헤더 추출
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
                    //return cell.getLocalDateTimeCellValue().format(dateTimeFormatter);

                    // [수정 후] 호환성 코드
                    return cell.getDateCellValue().toInstant()
                            .atZone(java.time.ZoneId.systemDefault())
                            .toLocalDateTime()
                            .format(dateTimeFormatter);
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
     * Redis 진행률 업데이트 (행 수 추적만, 완료 판정은 markChunkCompleted에서)
     */
    private void updateProgress(String uploadId, int deltaRows, int totalRows, Context context) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            String key = "upload:status:" + uploadId;
            long currentProcessed = jedis.hincrBy(key, "processedRows", deltaRows);
            context.getLogger().log("행 처리 누적: " + currentProcessed + "건");
        } catch (Exception e) {
            context.getLogger().log("WARNING: Redis 진행률 업데이트 실패: " + e.getMessage());
        }
    }

    /**
     * ★ 청크 완료 마킹 + chunk 기반 진행률/완료 판정
     *
     * processedRows >= totalRows 방식은 행 수 추정 오차로 COMPLETED가 안 될 수 있음.
     * completedChunks >= totalChunks 방식으로 변경하여 빈 청크도 정상 완료 처리.
     */
    private void markChunkCompleted(ProcessingMessage message, Context context) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            String key = "upload:status:" + message.getUploadId();

            // 완료 청크 수 원자적 증가
            long completedChunks = jedis.hincrBy(key, "completedChunks", 1);
            int totalChunks = message.getTotalChunks();

            // 진행률: 청크 기반 (빈 청크도 진행률에 반영)
            int progress = (int) ((completedChunks * 100.0) / totalChunks);
            jedis.hset(key, "progress", String.valueOf(Math.min(progress, 100)));

            context.getLogger().log("청크 완료: " + completedChunks + "/" + totalChunks +
                    " (" + progress + "%)");

            // 모든 청크 완료 시 COMPLETED
            if (completedChunks >= totalChunks) {
                jedis.hset(key, "status", "COMPLETED");
                jedis.hset(key, "progress", "100");
                context.getLogger().log("★ 전체 업로드 완료! (COMPLETED)");
            }
        } catch (Exception e) {
            context.getLogger().log("WARNING: 청크 완료 마킹 실패: " + e.getMessage());
        }
    }
}