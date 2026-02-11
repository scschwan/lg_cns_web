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
import com.mongodb.client.model.Filters; // ★ 필수 Import
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

public class ExcelWorkerHandler implements RequestHandler<SQSEvent, String> {

    private static final int BATCH_SIZE = 20000;
    private static final String AWS_REGION = System.getenv("AWS_REGION") != null
            ? System.getenv("AWS_REGION")
            : "ap-northeast-2";

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
        context.getLogger().log("=== [20260210-ver]Excel Worker 시작 ===");

        try {
            for (SQSEvent.SQSMessage message : sqsEvent.getRecords()) {
                ProcessingMessage processingMessage = gson.fromJson(message.getBody(), ProcessingMessage.class);

                context.getLogger().log("처리 시작: chunk=" + processingMessage.getChunkNumber() +
                        "/" + processingMessage.getTotalChunks() +
                        ", totalRows=" + processingMessage.getTotalRows());

                // ★ 모든 청크가 Redis 상태 보장 (totalRows, status=PROCESSING)
                ensureRedisStatus(processingMessage, context);

                processChunk(processingMessage, context);
                markChunkCompleted(processingMessage, context);
            }
            return "SUCCESS";
        } catch (Exception e) {
            context.getLogger().log("ERROR: " + e.getMessage());
            throw new RuntimeException(e);
        }
    }

    private void processChunk(ProcessingMessage message, Context context) throws IOException {
        Path tempFile = Files.createTempFile("excel-", ".xlsx");

        try {
            String s3Key = URLDecoder.decode(message.getS3Key(), java.nio.charset.StandardCharsets.UTF_8);

            try (ResponseInputStream<GetObjectResponse> s3Object = s3Client.getObject(
                    GetObjectRequest.builder().bucket(message.getS3Bucket()).key(s3Key).build())) {
                Files.copy(s3Object, tempFile, StandardCopyOption.REPLACE_EXISTING);
            }

            try (InputStream inputStream = new FileInputStream(tempFile.toFile());
                 Workbook workbook = StreamingReader.builder()
                         .rowCacheSize(100)
                         .bufferSize(4096)
                         .open(inputStream)) {

                Sheet sheet = workbook.getSheetAt(0);
                Iterator<Row> rowIterator = sheet.iterator();
                if (!rowIterator.hasNext()) return;

                Row headerRow = rowIterator.next();
                List<String> headers = extractHeaders(headerRow);

                MongoDatabase database = MongoDBConfig.getDatabase();
                MongoCollection<Document> collection = database.getCollection("raw_data");

                // ★ [핵심] 기존 데이터 삭제 (Delete before Insert)
                // 중복 실행되더라도 기존 데이터를 지우고 다시 넣으므로 데이터 뻥튀기가 발생하지 않음
                collection.deleteMany(
                        Filters.and(
                                Filters.eq("upload_id", message.getUploadId()),
                                Filters.gte("row_number", message.getStartRow() - 1),
                                Filters.lt("row_number", message.getEndRow())
                        )
                );

                List<Document> batch = new ArrayList<>();
                int processedCount = 0;
                int currentRowIndex = 1;

                while (rowIterator.hasNext()) {
                    Row row = rowIterator.next();

                    if (currentRowIndex < message.getStartRow() - 1) {
                        currentRowIndex++;
                        continue;
                    }
                    if (currentRowIndex >= message.getEndRow()) break;

                    Map<String, Object> rowData = extractRowDataStreaming(headers, row);
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

                    if (batch.size() >= BATCH_SIZE) {
                        collection.insertMany(batch);
                        int count = batch.size();
                        processedCount += count;
                        batch.clear();
                        updateProgress(message.getUploadId(), count, message.getTotalRows(), context);
                    }
                    currentRowIndex++;
                }

                if (!batch.isEmpty()) {
                    collection.insertMany(batch);
                    processedCount += batch.size();
                    updateProgress(message.getUploadId(), batch.size(), message.getTotalRows(), context);
                }

                context.getLogger().log("MongoDB 삽입 완료: " + processedCount + "건");
            }
        } finally {
            Files.deleteIfExists(tempFile);
        }
    }

    /**
     * ★ 모든 청크가 호출 - Redis 상태 보장
     *
     * 백엔드 saveUploadSession()이 먼저 키를 생성하므로 (totalRows=0, status=PENDING)
     * 기존 initializeRedisStatus()의 "exists → return" 로직으로는 totalRows가 영원히 0이었음.
     *
     * 이제 모든 청크가:
     * - totalRows: Coordinator가 알려준 정확한 값으로 덮어씀
     * - status: PENDING이면 PROCESSING으로 전환
     * - processedRows: 리셋하지 않음 (HINCRBY로만 증가)
     */
    private void ensureRedisStatus(ProcessingMessage message, Context context) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            String key = "upload:status:" + message.getUploadId();

            // ★ totalRows는 항상 Coordinator 값으로 설정 (백엔드가 0으로 만들었을 수 있음)
            jedis.hset(key, "totalRows", String.valueOf(message.getTotalRows()));

            // status: PENDING이면 PROCESSING으로 전환
            String currentStatus = jedis.hget(key, "status");
            if (currentStatus == null || "PENDING".equals(currentStatus)) {
                jedis.hset(key, "status", "PROCESSING");
            }

            // processedRows, completedChunks: 없을 때만 초기화 (리셋 안 함)
            if (!jedis.hexists(key, "processedRows")) {
                jedis.hset(key, "processedRows", "0");
            }
            if (!jedis.hexists(key, "completedChunks")) {
                jedis.hset(key, "completedChunks", "0");
            }

            jedis.expire(key, 86400);
        } catch (Exception e) {
            context.getLogger().log("Redis 상태 설정 실패: " + e.getMessage());
        }
    }

    private void updateProgress(String uploadId, int deltaRows, int totalRows, Context context) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            jedis.hincrBy("upload:status:" + uploadId, "processedRows", deltaRows);
        } catch (Exception e) {}
    }

    private void markChunkCompleted(ProcessingMessage message, Context context) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            String key = "upload:status:" + message.getUploadId();
            String setKey = "upload:completed_chunks:" + message.getUploadId();

            jedis.sadd(setKey, String.valueOf(message.getChunkNumber()));
            long completed = jedis.scard(setKey);

            int progress = (int) ((completed * 100.0) / message.getTotalChunks());
            jedis.hset(key, "progress", String.valueOf(Math.min(progress, 100)));
            jedis.hset(key, "completedChunks", String.valueOf(completed));
            jedis.expire(setKey, 86400);

            context.getLogger().log("청크 완료: " + completed + "/" + message.getTotalChunks() +
                    " (" + progress + "%)");

            if (completed >= message.getTotalChunks()) {
                jedis.hset(key, "status", "COMPLETED");
                jedis.hset(key, "progress", "100");

                // ★ COMPLETED 시점에 raw_data.countDocuments()로 정확한 totalRows 기록
                // (processedRows는 청크 완료 순서에 따라 부정확할 수 있으므로 별도로 계산)
                context.getLogger().log("★ 전체 업로드 완료! → file_sessions row_count 업데이트 시작");

                // ★ 마지막 Worker가 직접 file_sessions.row_count 업데이트
                long actualRowCount = updateFileSessionRowCount(message, context);

                // Redis에도 정확한 최종 행 수 기록
                if (actualRowCount > 0) {
                    jedis.hset(key, "totalRows", String.valueOf(actualRowCount));
                    jedis.hset(key, "processedRows", String.valueOf(actualRowCount));
                }
            }
        } catch (Exception e) {
            context.getLogger().log("markChunkCompleted ERROR: " + e.getMessage());
        }
    }

    /**
     * ★ 모든 청크 완료 시 file_sessions.row_count를 정확한 값으로 업데이트
     *
     * - 백엔드 서버/프론트엔드 폴링에 의존하지 않음
     * - Lambda Worker가 직접 MongoDB file_sessions 컬렉션을 업데이트
     * - raw_data.countDocuments()로 정확한 행 수 조회 (모든 Worker 완료 후)
     */
    private long updateFileSessionRowCount(ProcessingMessage message, Context context) {
        try {
            MongoDatabase database = MongoDBConfig.getDatabase();
            String uploadId = message.getUploadId();
            String sessionId = message.getSessionId();

            // 1. raw_data에서 정확한 row count 조회 (모든 Worker 완료 후이므로 정확)
            long rowCount = database.getCollection("raw_data")
                    .countDocuments(new Document("upload_id", uploadId));

            if (rowCount == 0) {
                context.getLogger().log("WARNING: COMPLETED인데 raw_data가 비어있음: " + uploadId);
                return 0;
            }

            // 2. raw_data에서 컬럼 정보 추출
            Document rawDoc = database.getCollection("raw_data")
                    .find(new Document("upload_id", uploadId))
                    .limit(1)
                    .first();

            List<String> columns = new ArrayList<>();
            if (rawDoc != null) {
                Object dataObj = rawDoc.get("data");
                if (dataObj instanceof Document) {
                    columns.addAll(((Document) dataObj).keySet());
                }
            }

            // 3. file_sessions에서 해당 session 찾기
            MongoCollection<Document> fileSessionsCol = database.getCollection("file_sessions");
            Document session = fileSessionsCol.find(Filters.eq("session_id", sessionId)).first();

            if (session == null) {
                context.getLogger().log("WARNING: file_sessions not found: sessionId=" + sessionId);
                return 0;
            }

            // 4. uploaded_files 배열에서 uploadId가 포함된 s3_key를 가진 파일의 인덱스 찾기
            List<Document> uploadedFiles = session.getList("uploaded_files", Document.class);
            if (uploadedFiles == null) {
                context.getLogger().log("WARNING: uploaded_files is null: sessionId=" + sessionId);
                return 0;
            }

            int targetIndex = -1;
            for (int i = 0; i < uploadedFiles.size(); i++) {
                String s3Key = uploadedFiles.get(i).getString("s3_key");
                if (s3Key != null && s3Key.contains(uploadId)) {
                    targetIndex = i;
                    break;
                }
            }

            if (targetIndex == -1) {
                context.getLogger().log("WARNING: uploadId와 매칭되는 파일 없음: uploadId=" + uploadId);
                return 0;
            }

            // 5. 해당 파일의 row_count, detected_columns, upload_status 업데이트
            String prefix = "uploaded_files." + targetIndex + ".";
            Document updateFields = new Document()
                    .append(prefix + "row_count", rowCount)
                    .append(prefix + "upload_status", "UPLOADED")
                    .append(prefix + "detected_columns", columns)
                    .append("updated_at", new java.util.Date());

            fileSessionsCol.updateOne(
                    Filters.eq("session_id", sessionId),
                    new Document("$set", updateFields)
            );

            context.getLogger().log("★ file_sessions 업데이트 완료: uploadId=" + uploadId +
                    ", rowCount=" + rowCount + ", columns=" + columns.size() +
                    ", sessionId=" + sessionId);

            return rowCount;

        } catch (Exception e) {
            context.getLogger().log("ERROR: file_sessions 업데이트 실패: " + e.getMessage());
            e.printStackTrace();
            return 0;
        }
    }

    // ... (Helper 메서드들: extractHeaders, extractRowDataStreaming, getCellValue 등은 그대로 사용)
    private Map<String, Object> extractRowDataStreaming(List<String> headers, Row row) {
        Map<String, Object> data = new LinkedHashMap<>();
        for (int i = 0; i < headers.size(); i++) {
            Cell cell = row.getCell(i);
            String header = headers.get(i);
            Object value = getCellValue(cell);
            // StreamingCell@xxx 오염 방어: 값이 객체 참조 문자열이면 null 처리
            if (value != null && value.toString().contains("StreamingCell@")) {
                value = null;
            }
            data.put(header, value);
        }
        return data;
    }

    private List<String> extractHeaders(Row headerRow) {
        List<String> headers = new ArrayList<>();
        for (Cell cell : headerRow) {
            String header = getCellValueAsString(cell);
            headers.add(header != null ? header : "Column_" + cell.getColumnIndex());
        }
        return headers;
    }

    private Object getCellValue(Cell cell) {
        if (cell == null) return null;
        switch (cell.getCellType()) {
            case STRING: return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getDateCellValue().toInstant()
                            .atZone(java.time.ZoneId.systemDefault())
                            .toLocalDateTime()
                            .format(dateTimeFormatter);
                }
                return cell.getNumericCellValue();
            case BOOLEAN: return cell.getBooleanCellValue();
            case FORMULA:
                // StreamingReader는 수식 평가를 지원하지 않으므로 캐시된 값 추출 시도
                try {
                    return cell.getStringCellValue();
                } catch (Exception e1) {
                    try {
                        return cell.getNumericCellValue();
                    } catch (Exception e2) {
                        return null;
                    }
                }
            case BLANK: return null;
            default:
                // StreamingCell은 toString()이 오버라이드되지 않아 객체 참조가 반환됨
                // getStringCellValue()로 실제 값 추출 시도
                try {
                    return cell.getStringCellValue();
                } catch (Exception e) {
                    return null;
                }
        }
    }

    private String getCellValueAsString(Cell cell) {
        Object value = getCellValue(cell);
        if (value != null && value.toString().contains("StreamingCell@")) {
            // 오염된 값이면 getStringCellValue()로 재시도
            try {
                return cell.getStringCellValue();
            } catch (Exception e) {
                return null;
            }
        }
        return value != null ? value.toString() : null;
    }
}