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

/**
 * Excel 데이터 처리 Worker Lambda Handler
 *
 * <p>Coordinator가 분할한 청크 단위의 SQS 메시지를 수신하여
 * S3에서 Excel 파일을 다운로드하고, 지정된 행 범위의 데이터를
 * MongoDB raw_data 컬렉션에 저장한다.</p>
 *
 * <p>주요 특징:</p>
 * <ul>
 *   <li>StreamingReader를 사용한 대용량 Excel 스트리밍 처리</li>
 *   <li>Delete-before-Insert 전략으로 중복 실행 시 데이터 뻥튀기 방지</li>
 *   <li>Redis를 통한 실시간 진행 상황 추적</li>
 *   <li>마지막 Worker가 file_sessions의 row_count를 정확하게 업데이트</li>
 *   <li>셀 값 오염 방어 (객체 참조 문자열, 빈 문자열 등 null 처리)</li>
 * </ul>
 *
 * @see ExcelCoordinatorHandler 청크 분할 및 SQS 발행 담당
 * @see ProcessingMessage Coordinator로부터 전달받는 메시지 모델
 */
public class ExcelWorkerHandler implements RequestHandler<SQSEvent, String> {

    /** MongoDB 배치 삽입 크기 (한 번에 20,000건씩 insertMany) */
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

    /**
     * SQS 이벤트를 수신하여 Excel 데이터 청크를 처리한다
     *
     * <p>각 SQS 메시지에 대해 Redis 상태 보장 -> 청크 처리 -> 완료 마킹 순서로 실행한다.</p>
     *
     * @param sqsEvent SQS 이벤트 (하나 이상의 ProcessingMessage 포함)
     * @param context  Lambda 실행 컨텍스트
     * @return "SUCCESS" 문자열
     */
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

    /**
     * 하나의 청크를 처리한다: S3 다운로드 -> Excel 파싱 -> MongoDB 저장
     *
     * <p>임시 파일에 S3 객체를 다운로드한 뒤, StreamingReader로 지정된 행 범위만
     * 읽어서 MongoDB raw_data 컬렉션에 배치 삽입한다.
     * 중복 실행 방지를 위해 삽입 전 해당 범위의 기존 데이터를 삭제한다.</p>
     *
     * @param message 처리할 청크 정보 (행 범위, S3 위치 등)
     * @param context Lambda 실행 컨텍스트
     * @throws IOException 파일 입출력 예외
     */
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

    /**
     * Redis에 처리된 행 수를 증분 업데이트한다 (HINCRBY)
     *
     * @param uploadId  업로드 ID
     * @param deltaRows 이번 배치에서 처리한 행 수
     * @param totalRows 전체 행 수
     * @param context   Lambda 실행 컨텍스트
     */
    private void updateProgress(String uploadId, int deltaRows, int totalRows, Context context) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            jedis.hincrBy("upload:status:" + uploadId, "processedRows", deltaRows);
        } catch (Exception e) {}
    }

    /**
     * 청크 완료를 Redis에 기록하고, 모든 청크 완료 시 최종 처리를 수행한다
     *
     * <p>Redis Set에 완료된 청크 번호를 추가하고, 모든 청크가 완료되면
     * 상태를 COMPLETED로 변경한 뒤 file_sessions의 row_count를 업데이트한다.</p>
     *
     * @param message 완료된 청크의 메시지 정보
     * @param context Lambda 실행 컨텍스트
     */
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

            // 6. ★ 세션 레벨 total_row_count 재계산 (모든 파일의 row_count 합산)
            //    → 프론트엔드에서 즉시 행 수 표시 가능
            try {
                // 업데이트된 세션 다시 읽기
                Document updatedSession = fileSessionsCol.find(Filters.eq("session_id", sessionId)).first();
                if (updatedSession != null) {
                    List<Document> allFiles = updatedSession.getList("uploaded_files", Document.class);
                    long totalRowCount = 0;
                    if (allFiles != null) {
                        for (Document f : allFiles) {
                            Object rc = f.get("row_count");
                            if (rc instanceof Number) {
                                totalRowCount += ((Number) rc).longValue();
                            }
                        }
                    }
                    fileSessionsCol.updateOne(
                            Filters.eq("session_id", sessionId),
                            new Document("$set", new Document("total_row_count", totalRowCount))
                    );
                    context.getLogger().log("★ session total_row_count 갱신: sessionId=" + sessionId +
                            ", totalRowCount=" + totalRowCount);
                }
            } catch (Exception e2) {
                context.getLogger().log("WARNING: total_row_count 갱신 실패 (무시): " + e2.getMessage());
            }

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

    /**
     * Excel 행에서 헤더에 매핑된 데이터를 추출한다
     *
     * <p>오염 방어 로직이 포함되어 StreamingCell 객체 참조 문자열,
     * 빈 문자열 등을 null로 처리한다.</p>
     *
     * @param headers 헤더 목록 (컬럼명)
     * @param row     Excel 행 데이터
     * @return 컬럼명-값 쌍의 맵 (순서 보장: LinkedHashMap)
     */
    private Map<String, Object> extractRowDataStreaming(List<String> headers, Row row) {
        Map<String, Object> data = new LinkedHashMap<>();
        for (int i = 0; i < headers.size(); i++) {
            Cell cell = row.getCell(i);
            String header = headers.get(i);
            Object value = getCellValue(cell);
            // 오염 방어: 객체 참조 문자열이거나 셀 타입 문자열이면 null 처리
            if (value instanceof String) {
                String sv = (String) value;
                if (sv.trim().isEmpty()
                        || sv.contains("StreamingCell@")
                        || sv.contains("Cell@")
                        || sv.matches(".*\\w+Cell@[0-9a-fA-F]+.*")) {
                    value = null;
                }
            }
            data.put(header, value);
        }
        return data;
    }

    /**
     * Excel 첫 번째 행에서 헤더(컬럼명) 목록을 추출한다
     *
     * @param headerRow 헤더 행
     * @return 컬럼명 리스트 (null인 경우 "Column_{인덱스}" 형식으로 대체)
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
     * Excel 셀의 값을 적절한 Java 타입으로 변환한다
     *
     * <p>셀 타입에 따라 문자열, 숫자, 날짜, 불리언 등으로 변환하며,
     * FORMULA 셀은 캐시된 값을 추출한다. 알 수 없는 셀 타입이나
     * 빈 값은 null을 반환한다.</p>
     *
     * @param cell Excel 셀 (null 가능)
     * @return 변환된 값 (String, Double, Boolean, 또는 null)
     */
    private Object getCellValue(Cell cell) {
        if (cell == null) return null;
        switch (cell.getCellType()) {
            case STRING:
                String strVal = cell.getStringCellValue();
                // 빈 문자열이거나 공백만 있으면 null 처리
                if (strVal == null || strVal.trim().isEmpty()) {
                    return null;
                }
                return strVal;
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
                    String fVal = cell.getStringCellValue();
                    if (fVal == null || fVal.trim().isEmpty()) return null;
                    return fVal;
                } catch (Exception e1) {
                    try {
                        return cell.getNumericCellValue();
                    } catch (Exception e2) {
                        return null;
                    }
                }
            case BLANK: return null;
            default:
                // 알 수 없는 셀 타입은 null 처리 (cell.toString() 호출 시 객체 참조 문자열 오염 방지)
                return null;
        }
    }

    /**
     * Excel 셀 값을 문자열로 변환한다 (오염된 값은 null 처리)
     *
     * @param cell Excel 셀 (null 가능)
     * @return 문자열 값 또는 null
     */
    private String getCellValueAsString(Cell cell) {
        Object value = getCellValue(cell);
        if (value == null) return null;
        String str = value.toString();
        // 오염된 값(객체 참조 문자열) 또는 빈 문자열이면 null 처리
        if (str.trim().isEmpty()
                || str.contains("Cell@")
                || str.matches(".*\\w+Cell@[0-9a-fA-F]+.*")) {
            return null;
        }
        return str;
    }
}