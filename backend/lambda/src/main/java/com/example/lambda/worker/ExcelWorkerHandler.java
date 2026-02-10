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
        context.getLogger().log("=== [20260209-ver]Excel Worker 시작 (Idempotent Ver) ===");

        try {
            for (SQSEvent.SQSMessage message : sqsEvent.getRecords()) {
                ProcessingMessage processingMessage = gson.fromJson(message.getBody(), ProcessingMessage.class);

                context.getLogger().log("처리 시작: chunk=" + processingMessage.getChunkNumber());

                if (processingMessage.isFirstChunk()) {
                    initializeRedisStatus(processingMessage.getUploadId(), processingMessage.getTotalRows(), context);
                }

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

    // ... (initializeRedisStatus, markChunkCompleted, extractHeaders, extractRowDataStreaming 등 나머지 메서드는 기존 유지)
    // 단, markChunkCompleted는 Set을 이용한 버전을 사용하면 더 좋습니다.

    // Redis 초기화
    private void initializeRedisStatus(String uploadId, int totalRows, Context context) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            String key = "upload:status:" + uploadId;
            // 이미 있으면 초기화하지 않음 (Coordinator가 여러번 보낼 경우 대비)
            if (jedis.exists(key)) return;

            jedis.hset(key, "status", "PROCESSING");
            jedis.hset(key, "progress", "0");
            jedis.hset(key, "totalRows", String.valueOf(totalRows));
            jedis.hset(key, "processedRows", "0");
            jedis.hset(key, "completedChunks", "0");
            jedis.expire(key, 86400);
        } catch (Exception e) {
            context.getLogger().log("Redis Init Error: " + e.getMessage());
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
                context.getLogger().log("★ 전체 업로드 완료! → file_sessions row_count 업데이트 시작");

                // ★ 마지막 Worker가 직접 file_sessions.row_count 업데이트
                updateFileSessionRowCount(message, context);
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
    private void updateFileSessionRowCount(ProcessingMessage message, Context context) {
        try {
            MongoDatabase database = MongoDBConfig.getDatabase();
            String uploadId = message.getUploadId();
            String sessionId = message.getSessionId();

            // 1. raw_data에서 정확한 row count 조회
            long rowCount = database.getCollection("raw_data")
                    .countDocuments(new Document("upload_id", uploadId));

            if (rowCount == 0) {
                context.getLogger().log("WARNING: COMPLETED인데 raw_data가 비어있음: " + uploadId);
                return;
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
                return;
            }

            // 4. uploaded_files 배열에서 uploadId가 포함된 s3_key를 가진 파일의 인덱스 찾기
            List<Document> uploadedFiles = session.getList("uploaded_files", Document.class);
            if (uploadedFiles == null) {
                context.getLogger().log("WARNING: uploaded_files is null: sessionId=" + sessionId);
                return;
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
                return;
            }

            // 5. 해당 파일의 row_count, detected_columns, upload_status 업데이트
            String prefix = "uploaded_files." + targetIndex + ".";
            Document updateFields = new Document()
                    .append(prefix + "row_count", rowCount)
                    .append(prefix + "upload_status", "UPLOADED")
                    .append(prefix + "detected_columns", columns)
                    .append("updated_at", LocalDateTime.now().format(dateTimeFormatter));

            fileSessionsCol.updateOne(
                    Filters.eq("session_id", sessionId),
                    new Document("$set", updateFields)
            );

            context.getLogger().log("★ file_sessions 업데이트 완료: uploadId=" + uploadId +
                    ", rowCount=" + rowCount + ", columns=" + columns.size() +
                    ", sessionId=" + sessionId);

        } catch (Exception e) {
            context.getLogger().log("ERROR: file_sessions 업데이트 실패: " + e.getMessage());
            e.printStackTrace();
        }
    }

    // ... (Helper 메서드들: extractHeaders, extractRowDataStreaming, getCellValue 등은 그대로 사용)
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
            case FORMULA: return cell.getCellFormula();
            default: return cell.toString();
        }
    }

    private String getCellValueAsString(Cell cell) {
        Object value = getCellValue(cell);
        return value != null ? value.toString() : null;
    }
}