package com.example.lambda.worker;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import com.example.lambda.config.MongoDBConfig;
import com.example.lambda.config.RedisConfig;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoCursor;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;
import redis.clients.jedis.Jedis;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 계정 분석 Lambda Handler
 *
 * <p>SQS 메시지를 수신하여 raw_data에서 선택된 계정에 해당하는 데이터를
 * session_data 컬렉션으로 복사한다.</p>
 *
 * <p>기존에는 백엔드에서 동기 처리(약 28초 대기)했으나,
 * SQS + Lambda 비동기 처리로 변경하여 응답 시간을 약 1초로 단축했다.</p>
 *
 * <p>처리 흐름:</p>
 * <ol>
 *   <li>SQS에서 ACCOUNT_ANALYSIS 타입 메시지 수신</li>
 *   <li>file_sessions에서 세션 정보(파일 목록, 계정명) 조회</li>
 *   <li>이미 session_data가 존재하면 skip (멱등성 보장)</li>
 *   <li>raw_data에서 선택된 계정에 해당하는 데이터를 커서 기반으로 스트리밍 복사</li>
 *   <li>Redis에 진행 상태 업데이트 (프론트엔드 폴링용)</li>
 * </ol>
 *
 * @see ProcessingMessage SQS 메시지 모델
 */
public class AccountAnalysisHandler implements RequestHandler<SQSEvent, String> {

    // ★ 한국 시간대(KST) 설정
    static {
        java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Seoul"));
    }

    private static final int BATCH_SIZE = 10_000;
    private static final int CURSOR_BATCH_SIZE = 5_000;
    private static final String ANALYSIS_STATUS_PREFIX = "analysis:status:";
    private static final int STATUS_TTL_SECONDS = 7200; // 2시간

    private final Gson gson = new Gson();
    private final DateTimeFormatter dateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    /**
     * SQS 이벤트를 수신하여 계정 분석을 수행한다
     *
     * @param sqsEvent SQS 이벤트 (ACCOUNT_ANALYSIS 타입 메시지 포함)
     * @param context  Lambda 실행 컨텍스트
     * @return "SUCCESS" 문자열
     */
    @Override
    public String handleRequest(SQSEvent sqsEvent, Context context) {
        context.getLogger().log("=== AccountAnalysis Worker 시작 ===");

        for (SQSEvent.SQSMessage message : sqsEvent.getRecords()) {
            try {
                Map<String, String> body = gson.fromJson(
                        message.getBody(), new TypeToken<Map<String, String>>() {}.getType());

                String type = body.get("type");
                if (!"ACCOUNT_ANALYSIS".equals(type)) {
                    context.getLogger().log("무시: 알 수 없는 메시지 타입 " + type);
                    continue;
                }

                String sessionId = body.get("sessionId");
                String projectId = body.get("projectId");

                context.getLogger().log("계정 분석 시작: sessionId=" + sessionId);
                processAccountAnalysis(sessionId, projectId, context);

            } catch (Exception e) {
                context.getLogger().log("ERROR: " + e.getMessage());
                e.printStackTrace();
            }
        }

        context.getLogger().log("=== AccountAnalysis Worker 완료 ===");
        return "SUCCESS";
    }

    /**
     * 계정 분석 메인 로직: raw_data -> session_data 복사
     *
     * <p>세션에 등록된 파일별로 raw_data에서 선택된 계정명에 해당하는 데이터를
     * 커서 기반 스트리밍으로 읽어서 session_data에 배치 삽입한다.</p>
     *
     * @param sessionId 세션 ID
     * @param projectId 프로젝트 ID
     * @param context   Lambda 실행 컨텍스트
     */
    private void processAccountAnalysis(String sessionId, String projectId, Context context) {
        MongoDatabase database = MongoDBConfig.getDatabase();
        MongoCollection<Document> rawDataCollection = database.getCollection("raw_data");
        MongoCollection<Document> sessionDataCollection = database.getCollection("session_data");

        // 1. file_sessions에서 세션 정보 조회
        MongoCollection<Document> fileSessionCollection = database.getCollection("file_sessions");
        Document sessionDoc = fileSessionCollection.find(new Document("session_id", sessionId)).first();

        if (sessionDoc == null) {
            context.getLogger().log("ERROR: 세션을 찾을 수 없습니다: " + sessionId);
            setStatus(sessionId, "FAILED", 0, 0, "세션을 찾을 수 없습니다");
            return;
        }

        // 2. 이미 session_data 존재하면 skip
        long existingCount = sessionDataCollection.countDocuments(new Document("session_id", sessionId));
        if (existingCount > 0) {
            context.getLogger().log("기존 session_data 존재: " + existingCount + "건 → skip");
            setStatus(sessionId, "COMPLETED", existingCount, 0, null);
            return;
        }

        // 3. 파일 정보 및 계정명 추출
        @SuppressWarnings("unchecked")
        List<Document> uploadedFiles = (List<Document>) sessionDoc.get("uploaded_files");
        @SuppressWarnings("unchecked")
        List<String> accountNames = (List<String>) sessionDoc.get("account_names");

        if (uploadedFiles == null || uploadedFiles.isEmpty()) {
            setStatus(sessionId, "FAILED", 0, 0, "세션에 파일이 없습니다");
            return;
        }

        if (accountNames == null || accountNames.isEmpty()) {
            setStatus(sessionId, "FAILED", 0, 0, "세션에 계정명이 없습니다");
            return;
        }

        setStatus(sessionId, "PROCESSING", 0, uploadedFiles.size(), null);

        // 4. 파일별 복사 실행
        long totalCopied = 0;
        String now = LocalDateTime.now().format(dateTimeFormatter);

        for (Document fileDoc : uploadedFiles) {
            String s3Key = fileDoc.getString("s3_key");
            String accountColumnName = fileDoc.getString("account_column_name");
            String uploadId = extractUploadIdFromS3Key(s3Key);

            if (uploadId == null || accountColumnName == null) {
                context.getLogger().log("WARN: uploadId 또는 accountColumnName 없음, 건너뜀");
                continue;
            }

            String dataFieldKey = "data." + accountColumnName;

            // raw_data 조회 (cursor 기반 스트리밍)
            Document filter = new Document()
                    .append("upload_id", uploadId)
                    .append(dataFieldKey, new Document("$in", accountNames));

            List<Document> batch = new ArrayList<>(BATCH_SIZE);
            long fileCopied = 0;

            try (MongoCursor<Document> cursor = rawDataCollection.find(filter)
                    .batchSize(CURSOR_BATCH_SIZE).cursor()) {

                while (cursor.hasNext()) {
                    Document rawDoc = cursor.next();

                    Document sessionDataDoc = new Document();
                    sessionDataDoc.put("project_id", projectId);
                    sessionDataDoc.put("session_id", sessionId);
                    sessionDataDoc.put("raw_data_id", rawDoc.getObjectId("_id").toString());
                    sessionDataDoc.put("upload_id", uploadId);
                    sessionDataDoc.put("row_number", rawDoc.getInteger("row_number"));
                    sessionDataDoc.put("data", rawDoc.get("data"));
                    sessionDataDoc.put("created_at", now);
                    batch.add(sessionDataDoc);

                    if (batch.size() >= BATCH_SIZE) {
                        sessionDataCollection.insertMany(batch);
                        fileCopied += batch.size();
                        batch.clear();
                        context.getLogger().log("배치 insert: " + fileCopied + "건");
                    }
                }
            }

            if (!batch.isEmpty()) {
                sessionDataCollection.insertMany(batch);
                fileCopied += batch.size();
            }

            totalCopied += fileCopied;
            context.getLogger().log("파일 복사 완료: uploadId=" + uploadId + ", " + fileCopied + "건");
        }

        // 5. 세션 상태 업데이트
        fileSessionCollection.updateOne(
                new Document("session_id", sessionId),
                new Document("$set", new Document()
                        .append("current_step", "START_ANALYSIS")
                        .append("updated_at", now))
        );

        // 6. Redis 상태 → 완료
        setStatus(sessionId, "COMPLETED", totalCopied, uploadedFiles.size(), null);

        context.getLogger().log("계정 분석 완료: sessionId=" + sessionId + ", 총 " + totalCopied + "건 복사");
    }

    /**
     * S3 키에서 업로드 ID를 추출한다
     *
     * <p>S3 키 구조: projects/{projectId}/sessions/{sessionId}/uploads/{uploadId}/{fileName}</p>
     *
     * @param s3Key S3 객체 키
     * @return 업로드 ID (6번째 경로 세그먼트) 또는 null
     */
    private String extractUploadIdFromS3Key(String s3Key) {
        if (s3Key == null) return null;
        String[] parts = s3Key.split("/");
        if (parts.length >= 6) {
            return parts[5];
        }
        return null;
    }

    /**
     * Redis에 계정 분석 진행 상태를 저장한다 (프론트엔드 폴링용)
     *
     * @param sessionId   세션 ID
     * @param status      상태 (PROCESSING, COMPLETED, FAILED)
     * @param copiedCount 복사된 데이터 건수
     * @param totalFiles  전체 파일 수
     * @param error       에러 메시지 (null 가능)
     */
    private void setStatus(String sessionId, String status, long copiedCount, int totalFiles, String error) {
        try (Jedis jedis = RedisConfig.getJedis()) {
            String key = ANALYSIS_STATUS_PREFIX + sessionId;
            jedis.hset(key, "status", status);
            jedis.hset(key, "copiedCount", String.valueOf(copiedCount));
            jedis.hset(key, "totalFiles", String.valueOf(totalFiles));
            jedis.hset(key, "updatedAt", LocalDateTime.now().format(dateTimeFormatter));
            if (error != null) {
                jedis.hset(key, "error", error);
            }
            jedis.expire(key, STATUS_TTL_SECONDS);
        } catch (Exception e) {
            // Redis 실패 시 무시 (Lambda 로그로만 기록)
            System.err.println("Redis 상태 저장 실패: " + e.getMessage());
        }
    }
}
