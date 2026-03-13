package com.example.finance.service.data;

import com.example.finance.exception.BusinessException;
import com.example.finance.model.session.FileSession;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.model.data.ColumnMappingDocument;
import com.example.finance.model.data.ProcessDataDocument;
import com.example.finance.repository.data.ColumnMappingRepository;
import com.example.finance.repository.data.ProcessDataRepository;
import com.example.finance.repository.data.SessionDataRepository;
import com.example.finance.repository.session.FileSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import com.example.finance.enums.ProcessStep;
import com.example.finance.service.common.RedisService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

@Slf4j
@Service
public class SessionDataService {

    private final MongoTemplate mongoTemplate;
    private final FileSessionRepository fileSessionRepository;
    private final SessionDataRepository sessionDataRepository;
    private final ColumnMappingRepository columnMappingRepository;
    private final ProcessDataRepository processDataRepository;
    private final RedisService redisService;
    private final ObjectMapper objectMapper;
    private final SqsClient sqsClient;

    @Value("${aws.sqs.analysis-queue-url:}")
    private String analysisQueueUrl;

    private static final int BATCH_SIZE = 10_000;
    private static final int THREAD_POOL_SIZE = 4;
    private static final int CURSOR_BATCH_SIZE = 5_000;
    private static final String SESSION_DATA_CACHE_PREFIX = "session_data:";
    private static final Duration SESSION_DATA_CACHE_TTL = Duration.ofMinutes(30);
    private static final String ANALYSIS_STATUS_PREFIX = "analysis:status:";
    private static final Duration ANALYSIS_STATUS_TTL = Duration.ofHours(2);

    public SessionDataService(MongoTemplate mongoTemplate,
                               FileSessionRepository fileSessionRepository,
                               SessionDataRepository sessionDataRepository,
                               ColumnMappingRepository columnMappingRepository,
                               ProcessDataRepository processDataRepository,
                               RedisService redisService,
                               ObjectMapper objectMapper,
                               @org.springframework.context.annotation.Lazy SqsClient sqsClient) {
        this.mongoTemplate = mongoTemplate;
        this.fileSessionRepository = fileSessionRepository;
        this.sessionDataRepository = sessionDataRepository;
        this.columnMappingRepository = columnMappingRepository;
        this.processDataRepository = processDataRepository;
        this.redisService = redisService;
        this.objectMapper = objectMapper;
        this.sqsClient = sqsClient;
    }

    /**
     * 계정 분석 시작 - raw_data → session_data 복사
     *
     * ⭐ 4단계 최적화: SQS + 비동기 처리
     *    - 기존: 동기 대기 28초
     *    - 변경: SQS 메시지 발행 → 즉시 응답 (1초)
     *    - 진행 상태는 Redis로 추적, 클라이언트가 폴링
     *
     * SQS 큐 미설정 시 fallback으로 @Async 스레드풀 사용
     */
    public Map<String, Object> startAccountAnalysis(String sessionId) {
        log.info("계정 분석 시작: sessionId={}", sessionId);

        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        Map<String, Object> result = new HashMap<>();
        result.put("sessionId", sessionId);

        // 이미 session_data가 존재하면 복사 skip
        long existingCount = sessionDataRepository.countBySessionId(sessionId);
        if (existingCount > 0) {
            log.info("기존 session_data 존재: sessionId={}, count={} → 복사 건너뜀",
                    sessionId, existingCount);
            result.put("copiedCount", existingCount);
            result.put("skipped", true);
            result.put("status", "COMPLETED");
            result.put("currentStep", session.getCurrentStep() != null
                    ? session.getCurrentStep().name() : "START_ANALYSIS");
            return result;
        }

        // 파일/계정 검증
        List<UploadedFileInfo> files = session.getUploadedFiles();
        if (files == null || files.isEmpty()) {
            throw new BusinessException("NO_FILES", "세션에 파일이 없습니다.");
        }

        List<String> accountNames = session.getAccountNames();
        if (accountNames == null || accountNames.isEmpty()) {
            throw new BusinessException("NO_ACCOUNTS", "세션에 계정명이 없습니다.");
        }

        // Redis 상태 초기화
        setAnalysisStatus(sessionId, "PROCESSING", 0, 0, null);

        // ★ SQS 큐가 설정되어 있으면 SQS로 발행, 아니면 비동기 스레드로 실행
        if (analysisQueueUrl != null && !analysisQueueUrl.isEmpty()) {
            sendToSqs(sessionId, session.getProjectId());
            log.info("SQS 메시지 발행 완료: sessionId={}", sessionId);
        } else {
            // Fallback: 비동기 스레드 실행
            CompletableFuture.runAsync(() -> executeAnalysisAsync(sessionId));
            log.info("비동기 스레드 실행 시작: sessionId={}", sessionId);
        }

        result.put("status", "PROCESSING");
        result.put("message", "분석이 시작되었습니다. 상태 조회 API로 진행률을 확인하세요.");
        result.put("skipped", false);
        return result;
    }

    /**
     * ⭐ 분석 상태 조회 (폴링용)
     */
    public Map<String, Object> getAnalysisStatus(String sessionId) {
        String statusKey = ANALYSIS_STATUS_PREFIX + sessionId;
        Map<String, Object> result = new HashMap<>();
        result.put("sessionId", sessionId);

        try {
            Map<Object, Object> status = redisService.hGetAll(statusKey);
            if (status != null && !status.isEmpty()) {
                result.put("status", status.getOrDefault("status", "UNKNOWN"));
                result.put("copiedCount", Long.parseLong(status.getOrDefault("copiedCount", "0").toString()));
                result.put("totalFiles", Integer.parseInt(status.getOrDefault("totalFiles", "0").toString()));
                if (status.containsKey("error")) {
                    result.put("error", status.get("error"));
                }
                return result;
            }
        } catch (Exception e) {
            log.warn("분석 상태 조회 실패: {}", e.getMessage());
        }

        // Redis에 상태가 없으면 session_data 존재 여부로 판단
        long count = sessionDataRepository.countBySessionId(sessionId);
        if (count > 0) {
            result.put("status", "COMPLETED");
            result.put("copiedCount", count);
        } else {
            result.put("status", "NOT_STARTED");
            result.put("copiedCount", 0L);
        }
        return result;
    }

    /**
     * 비동기 분석 실행 (SQS Lambda 또는 fallback 스레드에서 호출)
     */
    public void executeAnalysisAsync(String sessionId) {
        try {
            FileSession session = fileSessionRepository.findBySessionId(sessionId)
                    .orElseThrow(() -> new BusinessException(
                            "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

            List<UploadedFileInfo> files = session.getUploadedFiles();
            List<String> accountNames = session.getAccountNames();

            setAnalysisStatus(sessionId, "PROCESSING", 0, files.size(), null);

            long startTime = System.currentTimeMillis();
            long copiedCount = executeCopy(session, files, accountNames);
            long elapsed = System.currentTimeMillis() - startTime;

            log.info("계정 분석 완료: sessionId={}, 복사={}건, 소요={}ms",
                    sessionId, copiedCount, elapsed);

            // 세션 상태 업데이트
            session.setCurrentStep(ProcessStep.START_ANALYSIS);
            session.setUpdatedAt(LocalDateTime.now());
            fileSessionRepository.save(session);

            // Redis 상태 → 완료
            setAnalysisStatus(sessionId, "COMPLETED", copiedCount, files.size(), null);

            // session_data 캐시 무효화 (새로 복사되었으므로)
            invalidateSessionDataCache(sessionId);

        } catch (Exception e) {
            log.error("비동기 계정 분석 실패: sessionId={}", sessionId, e);
            setAnalysisStatus(sessionId, "FAILED", 0, 0, e.getMessage());
        }
    }

    /**
     * SQS 메시지 발행
     */
    private void sendToSqs(String sessionId, String projectId) {
        try {
            Map<String, String> messageBody = new HashMap<>();
            messageBody.put("type", "ACCOUNT_ANALYSIS");
            messageBody.put("sessionId", sessionId);
            messageBody.put("projectId", projectId);

            String body = objectMapper.writeValueAsString(messageBody);

            sqsClient.sendMessage(SendMessageRequest.builder()
                    .queueUrl(analysisQueueUrl)
                    .messageBody(body)
                    .build());

        } catch (Exception e) {
            log.error("SQS 메시지 발행 실패, 비동기 스레드 fallback: sessionId={}", sessionId, e);
            CompletableFuture.runAsync(() -> executeAnalysisAsync(sessionId));
        }
    }

    /**
     * Redis 분석 상태 설정
     */
    private void setAnalysisStatus(String sessionId, String status, long copiedCount, int totalFiles, String error) {
        try {
            String key = ANALYSIS_STATUS_PREFIX + sessionId;
            Map<String, String> statusMap = new HashMap<>();
            statusMap.put("status", status);
            statusMap.put("copiedCount", String.valueOf(copiedCount));
            statusMap.put("totalFiles", String.valueOf(totalFiles));
            statusMap.put("updatedAt", LocalDateTime.now().toString());
            if (error != null) {
                statusMap.put("error", error);
            }

            redisService.hSet(key, "status", status);
            redisService.hSet(key, "copiedCount", String.valueOf(copiedCount));
            redisService.hSet(key, "totalFiles", String.valueOf(totalFiles));
            redisService.hSet(key, "updatedAt", LocalDateTime.now().toString());
            if (error != null) {
                redisService.hSet(key, "error", error);
            }
            redisService.expire(key, ANALYSIS_STATUS_TTL);
        } catch (Exception e) {
            log.warn("분석 상태 저장 실패 (무시): {}", e.getMessage());
        }
    }

    /**
     * 병렬 복사 실행 (기존 코드에서 분리)
     */
    private long executeCopy(FileSession session, List<UploadedFileInfo> files,
                             List<String> accountNames) {
        ExecutorService executor = Executors.newFixedThreadPool(
                Math.min(THREAD_POOL_SIZE, files.size()));
        AtomicLong totalCopied = new AtomicLong(0);

        try {
            List<CompletableFuture<Long>> futures = files.stream()
                    .map(file -> CompletableFuture.supplyAsync(
                            () -> copyFileDataToSession(
                                    session.getProjectId(),
                                    session.getSessionId(),
                                    file,
                                    accountNames),
                            executor))
                    .collect(Collectors.toList());

            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            for (CompletableFuture<Long> future : futures) {
                try {
                    totalCopied.addAndGet(future.get());
                } catch (ExecutionException e) {
                    log.error("파일 복사 실패: {}", e.getCause().getMessage(), e.getCause());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        } finally {
            executor.shutdown();
            try {
                if (!executor.awaitTermination(30, TimeUnit.MINUTES)) {
                    executor.shutdownNow();
                }
            } catch (InterruptedException e) {
                executor.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }

        return totalCopied.get();
    }

    /**
     * 단일 파일의 raw_data → session_data 복사 (스레드 단위 작업)
     */
    private long copyFileDataToSession(String projectId,
                                       String sessionId,
                                       UploadedFileInfo file,
                                       List<String> accountNames) {
        String uploadId = extractUploadIdFromS3Key(file.getS3Key());
        String accountColumnName = file.getAccountColumnName();

        if (uploadId == null || accountColumnName == null) {
            log.warn("[{}] uploadId 또는 accountColumnName이 없어 건너뜁니다.", file.getFileName());
            return 0;
        }

        log.info("[{}] 복사 시작: uploadId={}, 계정컬럼={}, 계정값={}",
                file.getFileName(), uploadId, accountColumnName, accountNames);

        String dataFieldKey = "data." + accountColumnName;
        LocalDateTime now = LocalDateTime.now();

        // MongoDB cursor로 스트리밍 조회 (메모리에 전체 로드 안 함)
        Document filter = new Document()
                .append("upload_id", uploadId)
                .append(dataFieldKey, new Document("$in", accountNames));

        long copiedCount = 0;
        List<Document> batch = new ArrayList<>(BATCH_SIZE);

        try (var cursor = mongoTemplate.getCollection("raw_data")
                .find(filter)
                .batchSize(CURSOR_BATCH_SIZE)
                .cursor()) {

            while (cursor.hasNext()) {
                Document rawDoc = cursor.next();

                Document sessionDoc = new Document();
                sessionDoc.put("project_id", projectId);
                sessionDoc.put("session_id", sessionId);
                sessionDoc.put("raw_data_id", rawDoc.getObjectId("_id").toString());
                sessionDoc.put("upload_id", uploadId);
                sessionDoc.put("row_number", rawDoc.getInteger("row_number"));
                sessionDoc.put("data", rawDoc.get("data"));
                sessionDoc.put("created_at", now);
                batch.add(sessionDoc);

                if (batch.size() >= BATCH_SIZE) {
                    mongoTemplate.getCollection("session_data").insertMany(batch);
                    copiedCount += batch.size();
                    log.debug("[{}] 배치 insert: {}건 (누적: {}건)",
                            file.getFileName(), batch.size(), copiedCount);
                    batch.clear();
                }
            }
        }

        if (!batch.isEmpty()) {
            mongoTemplate.getCollection("session_data").insertMany(batch);
            copiedCount += batch.size();
        }

        log.info("[{}] 복사 완료: {}건", file.getFileName(), copiedCount);
        return copiedCount;
    }



    /**
     * s3Key에서 uploadId 추출
     * 형식: "projects/{projectId}/sessions/{sessionId}/uploads/{uploadId}/{fileName}"
     */
    private String extractUploadIdFromS3Key(String s3Key) {
        if (s3Key == null) return null;
        String[] parts = s3Key.split("/");
        // parts[0]=projects, [1]=projectId, [2]=sessions, [3]=sessionId,
        // [4]=uploads, [5]=uploadId, [6]=fileName
        if (parts.length >= 6) {
            return parts[5];
        }
        log.warn("s3Key에서 uploadId를 추출할 수 없습니다: {}", s3Key);
        return null;
    }

    /**
     * session_data 페이징 조회 + 동적 컬럼 추출
     *
     * ⭐ 3단계 최적화: Redis 캐싱 적용 (30분 TTL)
     *    - 기존: 매번 MongoDB 조회 (9초)
     *    - 변경: Redis 캐시 히트 시 < 100ms
     */
    public Map<String, Object> getSessionData(String sessionId, int page, int size) {
        // 1. Redis 캐시 확인
        String cacheKey = SESSION_DATA_CACHE_PREFIX + sessionId + ":page:" + page + ":size:" + size;
        try {
            Object cached = redisService.get(cacheKey);
            if (cached != null) {
                log.debug("session_data 캐시 히트: sessionId={}, page={}", sessionId, page);
                if (cached instanceof Map) {
                    return (Map<String, Object>) cached;
                }
                return objectMapper.convertValue(cached, new TypeReference<Map<String, Object>>() {});
            }
        } catch (Exception e) {
            log.warn("session_data 캐시 조회 실패 (무시): {}", e.getMessage());
        }

        // 2. MongoDB 조회 (is_hidden 포함하여 전체 반환, 프론트에서 회색 표시)
        long startTime = System.currentTimeMillis();

        Query countQuery = new Query(Criteria.where("session_id").is(sessionId));
        long totalCount = mongoTemplate.count(countQuery, "session_data");

        Query query = new Query(Criteria.where("session_id").is(sessionId))
                .with(org.springframework.data.domain.Sort.by("_id"))
                .skip((long) page * size)
                .limit(size);

        List<Document> documents = mongoTemplate.find(query, Document.class, "session_data");

        Set<String> columnSet = new LinkedHashSet<>();
        List<Map<String, Object>> rows = new ArrayList<>();

        for (Document doc : documents) {
            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) doc.get("data");
            if (data != null) {
                columnSet.addAll(data.keySet());

                Map<String, Object> row = new LinkedHashMap<>();
                row.put("_id", doc.getObjectId("_id").toString());
                row.put("row_number", doc.getInteger("row_number"));
                row.put("_isHidden", Boolean.TRUE.equals(doc.getBoolean("is_hidden")));
                row.putAll(data);
                rows.add(row);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("columns", new ArrayList<>(columnSet));
        result.put("data", rows);
        result.put("totalCount", totalCount);
        result.put("page", page);
        result.put("size", size);
        result.put("totalPages", (int) Math.ceil((double) totalCount / size));

        long elapsed = System.currentTimeMillis() - startTime;
        log.info("session_data 조회: sessionId={}, page={}, rows={}, {}ms",
                sessionId, page, rows.size(), elapsed);

        // 3. Redis 캐시 저장
        try {
            redisService.set(cacheKey, result, SESSION_DATA_CACHE_TTL);
        } catch (Exception e) {
            log.warn("session_data 캐시 저장 실패 (무시): {}", e.getMessage());
        }

        return result;
    }



    /**
     * 세션의 session_data 삭제 (재분석 또는 세션 삭제 시)
     * + Redis 캐시 무효화
     */
    public void deleteSessionData(String sessionId) {
        log.info("session_data 삭제: sessionId={}", sessionId);
        sessionDataRepository.deleteBySessionId(sessionId);
        invalidateSessionDataCache(sessionId);
    }

    /**
     * session_data Redis 캐시 무효화
     */
    private void invalidateSessionDataCache(String sessionId) {
        try {
            String pattern = SESSION_DATA_CACHE_PREFIX + sessionId + ":*";
            Set<String> keys = redisService.keys(pattern);
            if (keys != null && !keys.isEmpty()) {
                Long deleted = redisService.delete(keys);
                log.info("session_data 캐시 무효화: sessionId={}, {}개 키 삭제", sessionId, deleted);
            }
        } catch (Exception e) {
            log.warn("session_data 캐시 무효화 실패 (무시): {}", e.getMessage());
        }
    }

    // ========== 컬럼 매핑 관리 ==========

    /**
     * 컬럼 매핑 초기화 (detected_columns 기반)
     * 이미 존재하면 기존 데이터 반환
     */
    public List<ColumnMappingDocument> initColumnMappings(String sessionId) {
        long existingCount = columnMappingRepository.countBySessionId(sessionId);
        if (existingCount > 0) {
            return columnMappingRepository.findBySessionIdOrderBySequenceAsc(sessionId);
        }

        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        // uploaded_files의 detected_columns에서 컬럼 목록 추출
        Set<String> allColumns = new LinkedHashSet<>();
        if (session.getUploadedFiles() != null) {
            for (UploadedFileInfo file : session.getUploadedFiles()) {
                if (file.getDetectedColumns() != null) {
                    allColumns.addAll(file.getDetectedColumns());
                }
            }
        }

        List<ColumnMappingDocument> mappings = new ArrayList<>();
        int seq = 1;
        for (String colName : allColumns) {
            mappings.add(ColumnMappingDocument.builder()
                    .sessionId(sessionId)
                    .originalName(colName)
                    .displayName(colName)
                    .dataType("text")
                    .isVisible(true)
                    .sequence(seq++)
                    .build());
        }

        if (!mappings.isEmpty()) {
            columnMappingRepository.saveAll(mappings);
            log.info("컬럼 매핑 초기화: sessionId={}, {}개 컬럼", sessionId, mappings.size());
        }

        return mappings;
    }

    /**
     * 컬럼 매핑 목록 조회
     */
    public List<ColumnMappingDocument> getColumnMappings(String sessionId) {
        List<ColumnMappingDocument> mappings = columnMappingRepository.findBySessionIdOrderBySequenceAsc(sessionId);
        if (mappings.isEmpty()) {
            // 아직 초기화 안 됐으면 자동 초기화
            return initColumnMappings(sessionId);
        }
        return mappings;
    }

    /**
     * 컬럼 가시성 토글
     */
    public ColumnMappingDocument updateColumnVisibility(String sessionId, String columnName, boolean isVisible) {
        ColumnMappingDocument mapping = columnMappingRepository.findBySessionIdAndOriginalName(sessionId, columnName)
                .orElseThrow(() -> new BusinessException(
                        "COLUMN_NOT_FOUND", "컬럼을 찾을 수 없습니다: " + columnName));

        mapping.setIsVisible(isVisible);
        columnMappingRepository.save(mapping);

        // 캐시 무효화
        invalidateSessionDataCache(sessionId);

        log.info("컬럼 가시성 변경: sessionId={}, column={}, visible={}", sessionId, columnName, isVisible);
        return mapping;
    }

    /**
     * 컬럼 매핑 일괄 업데이트
     */
    public List<ColumnMappingDocument> updateColumnMappingsBatch(String sessionId, List<Map<String, Object>> updates) {
        for (Map<String, Object> update : updates) {
            String columnName = (String) update.get("originalName");
            Boolean isVisible = (Boolean) update.get("isVisible");

            if (columnName != null && isVisible != null) {
                columnMappingRepository.findBySessionIdAndOriginalName(sessionId, columnName)
                        .ifPresent(mapping -> {
                            mapping.setIsVisible(isVisible);
                            columnMappingRepository.save(mapping);
                        });
            }
        }

        invalidateSessionDataCache(sessionId);
        return columnMappingRepository.findBySessionIdOrderBySequenceAsc(sessionId);
    }

    // ========== 데이터 삭제 (is_hidden) ==========

    /**
     * session_data에서 특정 컬럼의 값으로 검색
     */
    public List<Map<String, Object>> searchSessionData(String sessionId, String columnName, String keyword) {
        String fieldPath = "data." + columnName;

        Criteria criteria = new Criteria().andOperator(
                Criteria.where("session_id").is(sessionId),
                Criteria.where(fieldPath).regex(keyword, "i"),
                Criteria.where("is_hidden").ne(true)
        );

        Query query = new Query(criteria).limit(500);

        List<Document> documents = mongoTemplate.find(query, Document.class, "session_data");

        List<Map<String, Object>> results = new ArrayList<>();
        for (Document doc : documents) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("_id", doc.getObjectId("_id").toString());
            row.put("row_number", doc.getInteger("row_number"));
            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) doc.get("data");
            if (data != null) {
                row.putAll(data);
            }
            results.add(row);
        }

        log.info("session_data 검색: sessionId={}, column={}, keyword={}, 결과={}건",
                sessionId, columnName, keyword, results.size());
        return results;
    }

    /**
     * session_data에서 특정 컬럼의 고유 값 목록 조회 (검색용)
     */
    public List<Map<String, Object>> getDistinctValues(String sessionId, String columnName) {
        String fieldPath = "data." + columnName;

        List<Document> pipeline = new ArrayList<>();
        pipeline.add(new Document("$match", new Document("session_id", sessionId)
                .append("is_hidden", new Document("$ne", true))));
        pipeline.add(new Document("$group", new Document("_id", "$" + fieldPath)
                .append("count", new Document("$sum", 1))));
        pipeline.add(new Document("$sort", new Document("_id", 1)));
        pipeline.add(new Document("$limit", 1000));

        List<Document> results = mongoTemplate.getCollection("session_data")
                .aggregate(pipeline)
                .into(new ArrayList<>());

        List<Map<String, Object>> values = new ArrayList<>();
        for (Document doc : results) {
            Object idObj = doc.get("_id");
            if (idObj == null) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("value", idObj.toString());
            Object countObj = doc.get("count");
            item.put("count", countObj instanceof Number ? ((Number) countObj).longValue() : 0L);
            values.add(item);
        }

        return values;
    }

    /**
     * session_data 행 숨김 처리 (is_hidden = true)
     */
    public long hideSessionDataRows(String sessionId, List<String> rowIds) {
        org.springframework.data.mongodb.core.query.Update update =
                new org.springframework.data.mongodb.core.query.Update().set("is_hidden", true);

        List<org.bson.types.ObjectId> objectIds = rowIds.stream()
                .map(org.bson.types.ObjectId::new)
                .collect(Collectors.toList());

        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .and("_id").in(objectIds));

        var result = mongoTemplate.updateMulti(query, update, "session_data");
        long modifiedCount = result.getModifiedCount();

        invalidateSessionDataCache(sessionId);
        log.info("session_data 행 숨김: sessionId={}, 요청={}건, 처리={}건",
                sessionId, rowIds.size(), modifiedCount);
        return modifiedCount;
    }

    /**
     * session_data 행 원복 (is_hidden = false)
     */
    public long restoreSessionDataRows(String sessionId, List<String> rowIds) {
        org.springframework.data.mongodb.core.query.Update update =
                new org.springframework.data.mongodb.core.query.Update().set("is_hidden", false);

        List<org.bson.types.ObjectId> objectIds = rowIds.stream()
                .map(org.bson.types.ObjectId::new)
                .collect(Collectors.toList());

        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .and("_id").in(objectIds));

        var result = mongoTemplate.updateMulti(query, update, "session_data");
        long modifiedCount = result.getModifiedCount();

        invalidateSessionDataCache(sessionId);
        log.info("session_data 행 원복: sessionId={}, 요청={}건, 처리={}건",
                sessionId, rowIds.size(), modifiedCount);
        return modifiedCount;
    }

    /**
     * 컬럼 매핑 삭제 (세션 삭제 시)
     */
    public void deleteColumnMappings(String sessionId) {
        columnMappingRepository.deleteBySessionId(sessionId);
        log.info("컬럼 매핑 삭제: sessionId={}", sessionId);
    }

    // ========== 데이터 삭제 - 컬럼 값 기반 ==========

    /**
     * 특정 컬럼의 고유 값 목록 + hidden 상태 분리 조회
     * visible(is_hidden!=true)과 hidden(is_hidden=true) 각각의 고유 값/건수 반환
     */
    public Map<String, Object> getDistinctValuesWithStatus(String sessionId, String columnName) {
        String fieldPath = "data." + columnName;

        // visible 값
        List<Document> visiblePipeline = new ArrayList<>();
        visiblePipeline.add(new Document("$match", new Document("session_id", sessionId)
                .append("is_hidden", new Document("$ne", true))));
        visiblePipeline.add(new Document("$group", new Document("_id", "$" + fieldPath)
                .append("count", new Document("$sum", 1))));
        visiblePipeline.add(new Document("$sort", new Document("count", -1)));
        visiblePipeline.add(new Document("$limit", 5000));

        List<Document> visibleResults = mongoTemplate.getCollection("session_data")
                .aggregate(visiblePipeline).into(new ArrayList<>());

        List<Map<String, Object>> visibleValues = new ArrayList<>();
        for (Document doc : visibleResults) {
            Object idObj = doc.get("_id");
            Map<String, Object> item = new LinkedHashMap<>();
            // null/빈 값은 __NULL__ 센티널로 표시
            if (idObj == null || idObj.toString().trim().isEmpty()) {
                item.put("value", "__NULL__");
            } else {
                item.put("value", idObj.toString());
            }
            Object countObj = doc.get("count");
            item.put("count", countObj instanceof Number ? ((Number) countObj).longValue() : 0L);
            visibleValues.add(item);
        }

        // hidden 값
        List<Document> hiddenPipeline = new ArrayList<>();
        hiddenPipeline.add(new Document("$match", new Document("session_id", sessionId)
                .append("is_hidden", true)));
        hiddenPipeline.add(new Document("$group", new Document("_id", "$" + fieldPath)
                .append("count", new Document("$sum", 1))));
        hiddenPipeline.add(new Document("$sort", new Document("count", -1)));
        hiddenPipeline.add(new Document("$limit", 5000));

        List<Document> hiddenResults = mongoTemplate.getCollection("session_data")
                .aggregate(hiddenPipeline).into(new ArrayList<>());

        List<Map<String, Object>> hiddenValues = new ArrayList<>();
        for (Document doc : hiddenResults) {
            Object idObj = doc.get("_id");
            Map<String, Object> item = new LinkedHashMap<>();
            if (idObj == null || idObj.toString().trim().isEmpty()) {
                item.put("value", "__NULL__");
            } else {
                item.put("value", idObj.toString());
            }
            Object countObj = doc.get("count");
            item.put("count", countObj instanceof Number ? ((Number) countObj).longValue() : 0L);
            hiddenValues.add(item);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("visible", visibleValues);
        result.put("hidden", hiddenValues);

        log.info("distinct values (with status): sessionId={}, column={}, visible={}, hidden={}",
                sessionId, columnName, visibleValues.size(), hiddenValues.size());
        return result;
    }

    /**
     * 특정 컬럼 값 기반으로 행 숨김 처리 (is_hidden = true)
     */
    public long hideByColumnValues(String sessionId, String columnName, List<String> values) {
        String fieldPath = "data." + columnName;

        org.springframework.data.mongodb.core.query.Update update =
                new org.springframework.data.mongodb.core.query.Update().set("is_hidden", true);

        // __NULL__ 처리: null/빈 값도 매칭
        boolean hasNull = values.contains("__NULL__");
        List<String> normalValues = values.stream()
                .filter(v -> !"__NULL__".equals(v))
                .collect(Collectors.toList());

        Criteria valueCriteria;
        if (hasNull && normalValues.isEmpty()) {
            valueCriteria = new Criteria().orOperator(
                    Criteria.where(fieldPath).is(null),
                    Criteria.where(fieldPath).is(""),
                    Criteria.where(fieldPath).exists(false));
        } else if (hasNull) {
            valueCriteria = new Criteria().orOperator(
                    Criteria.where(fieldPath).in(normalValues),
                    Criteria.where(fieldPath).is(null),
                    Criteria.where(fieldPath).is(""),
                    Criteria.where(fieldPath).exists(false));
        } else {
            valueCriteria = Criteria.where(fieldPath).in(normalValues);
        }

        Query query = new Query(new Criteria().andOperator(
                Criteria.where("session_id").is(sessionId),
                valueCriteria,
                Criteria.where("is_hidden").ne(true)
        ));

        var result = mongoTemplate.updateMulti(query, update, "session_data");
        long modifiedCount = result.getModifiedCount();

        invalidateSessionDataCache(sessionId);
        log.info("컬럼 값 기반 행 숨김: sessionId={}, column={}, values={}, 처리={}건",
                sessionId, columnName, values.size(), modifiedCount);
        return modifiedCount;
    }

    /**
     * 특정 컬럼 값 기반으로 행 원복 (is_hidden = false)
     */
    public long restoreByColumnValues(String sessionId, String columnName, List<String> values) {
        String fieldPath = "data." + columnName;

        org.springframework.data.mongodb.core.query.Update update =
                new org.springframework.data.mongodb.core.query.Update().set("is_hidden", false);

        // __NULL__ 처리: null/빈 값도 매칭
        boolean hasNull = values.contains("__NULL__");
        List<String> normalValues = values.stream()
                .filter(v -> !"__NULL__".equals(v))
                .collect(Collectors.toList());

        Criteria valueCriteria;
        if (hasNull && normalValues.isEmpty()) {
            valueCriteria = new Criteria().orOperator(
                    Criteria.where(fieldPath).is(null),
                    Criteria.where(fieldPath).is(""),
                    Criteria.where(fieldPath).exists(false));
        } else if (hasNull) {
            valueCriteria = new Criteria().orOperator(
                    Criteria.where(fieldPath).in(normalValues),
                    Criteria.where(fieldPath).is(null),
                    Criteria.where(fieldPath).is(""),
                    Criteria.where(fieldPath).exists(false));
        } else {
            valueCriteria = Criteria.where(fieldPath).in(normalValues);
        }

        Query query = new Query(new Criteria().andOperator(
                Criteria.where("session_id").is(sessionId),
                valueCriteria,
                Criteria.where("is_hidden").is(true)
        ));

        var result = mongoTemplate.updateMulti(query, update, "session_data");
        long modifiedCount = result.getModifiedCount();

        invalidateSessionDataCache(sessionId);
        log.info("컬럼 값 기반 행 원복: sessionId={}, column={}, values={}, 처리={}건",
                sessionId, columnName, values.size(), modifiedCount);
        return modifiedCount;
    }

    // ========== 표준화 기능 ==========

    /**
     * 두 컬럼 기준 그룹바이 (key열 + 변경열 → 건수)
     */
    public List<Map<String, Object>> groupByTwoColumns(String sessionId, String keyColumn, String changeColumn) {
        String keyPath = "data." + keyColumn;
        String changePath = "data." + changeColumn;

        List<Document> pipeline = new ArrayList<>();
        pipeline.add(new Document("$match", new Document("session_id", sessionId)
                .append("is_hidden", new Document("$ne", true))));
        pipeline.add(new Document("$group", new Document("_id",
                new Document("keyValue", "$" + keyPath)
                        .append("changeValue", "$" + changePath))
                .append("count", new Document("$sum", 1))));
        pipeline.add(new Document("$sort", new Document("_id.keyValue", 1).append("count", -1)));
        pipeline.add(new Document("$limit", 10000));

        List<Document> results = mongoTemplate.getCollection("session_data")
                .aggregate(pipeline).into(new ArrayList<>());

        List<Map<String, Object>> groupedData = new ArrayList<>();
        for (Document doc : results) {
            Document idDoc = (Document) doc.get("_id");
            if (idDoc == null) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("keyValue", idDoc.get("keyValue") != null ? idDoc.get("keyValue").toString() : "");
            item.put("changeValue", idDoc.get("changeValue") != null ? idDoc.get("changeValue").toString() : "");
            Object countObj = doc.get("count");
            item.put("count", countObj instanceof Number ? ((Number) countObj).longValue() : 0L);
            groupedData.add(item);
        }

        log.info("두 컬럼 그룹바이: sessionId={}, key={}, change={}, 결과={}건",
                sessionId, keyColumn, changeColumn, groupedData.size());
        return groupedData;
    }

    /**
     * 표준화 수행: key값별로 변경열 데이터를 가장 빈도 높은 값으로 통일
     */
    public Map<String, Object> standardizeData(String sessionId, String keyColumn, String changeColumn) {
        // 1. group by 결과에서 key값별 최빈값 추출
        List<Map<String, Object>> grouped = groupByTwoColumns(sessionId, keyColumn, changeColumn);

        // key값 → 최빈 변경값 매핑 (이미 count desc로 정렬됨)
        Map<String, String> keyToMostFrequent = new LinkedHashMap<>();
        for (Map<String, Object> item : grouped) {
            String keyValue = (String) item.get("keyValue");
            String changeValue = (String) item.get("changeValue");
            // 첫 번째 등장이 가장 빈도 높음 (정렬 보장)
            keyToMostFrequent.putIfAbsent(keyValue, changeValue);
        }

        // 2. 표준화가 필요한 key값 찾기 (변경열 값이 2개 이상인 key)
        Map<String, Set<String>> keyToAllValues = new LinkedHashMap<>();
        for (Map<String, Object> item : grouped) {
            String keyValue = (String) item.get("keyValue");
            String changeValue = (String) item.get("changeValue");
            keyToAllValues.computeIfAbsent(keyValue, k -> new LinkedHashSet<>()).add(changeValue);
        }

        long totalUpdated = 0;
        int keysStandardized = 0;
        String changePath = "data." + changeColumn;
        String keyPath = "data." + keyColumn;

        for (Map.Entry<String, Set<String>> entry : keyToAllValues.entrySet()) {
            if (entry.getValue().size() <= 1) continue; // 이미 통일됨

            String keyValue = entry.getKey();
            String targetValue = keyToMostFrequent.get(keyValue);

            // 해당 key값을 가진 행 중 변경열이 targetValue가 아닌 행을 업데이트
            Query query = new Query(new Criteria().andOperator(
                    Criteria.where("session_id").is(sessionId),
                    Criteria.where(keyPath).is(keyValue),
                    Criteria.where(changePath).ne(targetValue),
                    Criteria.where("is_hidden").ne(true)
            ));

            org.springframework.data.mongodb.core.query.Update update =
                    new org.springframework.data.mongodb.core.query.Update().set(changePath, targetValue);

            var result = mongoTemplate.updateMulti(query, update, "session_data");
            totalUpdated += result.getModifiedCount();
            keysStandardized++;
        }

        invalidateSessionDataCache(sessionId);

        Map<String, Object> result = new HashMap<>();
        result.put("keysStandardized", keysStandardized);
        result.put("totalUpdated", totalUpdated);
        result.put("keyColumn", keyColumn);
        result.put("changeColumn", changeColumn);

        log.info("표준화 완료: sessionId={}, key={}, change={}, 표준화key={}개, 변경행={}건",
                sessionId, keyColumn, changeColumn, keysStandardized, totalUpdated);
        return result;
    }

    // ========== process_data 생성 (Step 2 → Step 3) ==========

    private static final String PROCESS_DATA_COLLECTION = "process_data";
    private static final String PROCESS_STATUS_PREFIX = "process:status:";
    private static final Duration PROCESS_STATUS_TTL = Duration.ofHours(2);
    private static final int PROCESS_BATCH_SIZE = 5_000;

    /**
     * session_data에서 process_data 생성 (비동기)
     *
     * SQS 큐가 설정된 경우 SQS로 처리, 아닌 경우 @Async 스레드풀 사용
     * 진행 상태는 Redis로 추적, 클라이언트가 폴링
     */
    public Map<String, Object> prepareProcessData(String sessionId, Map<String, String> requiredColumns) {
        log.info("process_data 생성 요청: sessionId={}", sessionId);

        // 세션 조회 (유효성 검증)
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        // Redis에 진행 상태 초기화
        String statusKey = PROCESS_STATUS_PREFIX + sessionId;
        Map<String, Object> status = new HashMap<>();
        status.put("status", "PROCESSING");
        status.put("progress", 0);
        status.put("processedCount", 0);
        status.put("totalCount", 0);
        status.put("startTime", System.currentTimeMillis());
        redisService.set(statusKey, status, PROCESS_STATUS_TTL);

        // 필수 항목 매핑을 먼저 세션에 저장
        if (requiredColumns != null) {
            session.setCategoryColumn(requiredColumns.getOrDefault("category", null));
            session.setCostCenterColumn(requiredColumns.getOrDefault("costCenter", null));
            session.setSupplierColumn(requiredColumns.getOrDefault("supplier", null));
            session.setAmountColumn(requiredColumns.getOrDefault("amount", null));
            session.setTargetColumn(requiredColumns.getOrDefault("target", null));
            session.setUpdatedAt(LocalDateTime.now());
            fileSessionRepository.save(session);
        }

        // 비동기 처리 시작
        CompletableFuture.runAsync(() -> {
            try {
                executePrepareProcessData(sessionId, session.getProjectId());
            } catch (Exception e) {
                log.error("process_data 생성 실패: sessionId={}", sessionId, e);
                Map<String, Object> errorStatus = new HashMap<>();
                errorStatus.put("status", "FAILED");
                errorStatus.put("error", e.getMessage());
                redisService.set(statusKey, errorStatus, PROCESS_STATUS_TTL);
            }
        });

        Map<String, Object> result = new HashMap<>();
        result.put("sessionId", sessionId);
        result.put("status", "PROCESSING");
        result.put("message", "process_data 생성이 비동기로 시작되었습니다.");
        return result;
    }

    /**
     * process_data 생성 실행 (병렬 처리 + native insertMany)
     *
     * ⭐ MappingMongoConverter 우회: 컬럼명에 dots(.)이 포함된 경우
     *    Spring Data의 repository.saveAll()이 MappingException을 던지므로
     *    native MongoDB driver의 insertMany()를 사용하여 BSON Document 직접 삽입
     *
     * ⭐ 병렬 처리: 커서에서 배치 단위로 읽어 멀티스레드로 동시 삽입
     */
    private void executePrepareProcessData(String sessionId, String projectId) {
        long startTime = System.currentTimeMillis();
        String statusKey = PROCESS_STATUS_PREFIX + sessionId;

        // 1. 기존 process_data 삭제 (native delete for speed)
        mongoTemplate.getCollection(PROCESS_DATA_COLLECTION)
                .deleteMany(new Document("session_id", sessionId));
        log.info("기존 process_data 삭제 완료: sessionId={}", sessionId);

        // 2. visible 컬럼 목록 조회
        List<ColumnMappingDocument> mappings = columnMappingRepository.findBySessionIdOrderBySequenceAsc(sessionId);
        Set<String> visibleColumns = mappings.stream()
                .filter(ColumnMappingDocument::getIsVisible)
                .map(ColumnMappingDocument::getOriginalName)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        if (visibleColumns.isEmpty()) {
            throw new BusinessException("NO_VISIBLE_COLUMNS", "표시할 컬럼이 없습니다.");
        }
        visibleColumns.remove("_id");
        visibleColumns.remove("row_number");
        log.info("visible 컬럼: {}", visibleColumns);

        // 3. session_data 건수 조회
        Document matchFilter = new Document("session_id", sessionId)
                .append("is_hidden", new Document("$ne", true));
        long totalCount = mongoTemplate.getCollection("session_data").countDocuments(matchFilter);
        log.info("처리 대상 session_data: {}건", totalCount);

        // Redis 상태 업데이트
        Map<String, Object> progressStatus = new HashMap<>();
        progressStatus.put("status", "PROCESSING");
        progressStatus.put("totalCount", totalCount);
        progressStatus.put("processedCount", 0);
        progressStatus.put("progress", 0);
        redisService.set(statusKey, progressStatus, PROCESS_STATUS_TTL);

        // 4. 병렬 스레드풀 생성
        ExecutorService executor = Executors.newFixedThreadPool(THREAD_POOL_SIZE);
        AtomicLong processedCount = new AtomicLong(0);
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        // 5. 커서로 session_data 읽기 → 배치 단위로 병렬 삽입
        List<Document> bsonBatch = new ArrayList<>(PROCESS_BATCH_SIZE);

        try (var cursor = mongoTemplate.getCollection("session_data")
                .find(matchFilter).batchSize(CURSOR_BATCH_SIZE).cursor()) {

            while (cursor.hasNext()) {
                Document doc = cursor.next();
                Document dataDoc = (Document) doc.get("data");
                if (dataDoc == null) continue;

                // visible 컬럼만 추출 → BSON Document로 직접 생성
                Document filteredData = new Document();
                for (String col : visibleColumns) {
                    if (dataDoc.containsKey(col)) {
                        filteredData.put(col, dataDoc.get(col));
                    }
                }

                Document bsonDoc = new Document()
                        .append("project_id", projectId)
                        .append("session_id", sessionId)
                        .append("raw_data_id", doc.get("raw_data_id") != null ? doc.get("raw_data_id").toString() : null)
                        .append("data", filteredData)
                        .append("is_hidden", false)
                        .append("created_at", now);

                bsonBatch.add(bsonDoc);

                if (bsonBatch.size() >= PROCESS_BATCH_SIZE) {
                    // 배치를 복사하여 병렬 스레드에 전달
                    List<Document> batchToInsert = new ArrayList<>(bsonBatch);
                    bsonBatch.clear();

                    CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                        mongoTemplate.getCollection(PROCESS_DATA_COLLECTION).insertMany(batchToInsert);
                        long current = processedCount.addAndGet(batchToInsert.size());

                        // Redis 진행 상태 업데이트
                        int progress = totalCount > 0 ? (int) (current * 100 / totalCount) : 0;
                        Map<String, Object> ps = new HashMap<>();
                        ps.put("status", "PROCESSING");
                        ps.put("totalCount", totalCount);
                        ps.put("processedCount", current);
                        ps.put("progress", Math.min(progress, 99));
                        redisService.set(statusKey, ps, PROCESS_STATUS_TTL);

                        log.debug("process_data 배치 삽입: {}건 / {}건", current, totalCount);
                    }, executor);

                    futures.add(future);
                }
            }
        }

        // 잔여 배치 삽입
        if (!bsonBatch.isEmpty()) {
            List<Document> remainBatch = new ArrayList<>(bsonBatch);
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                mongoTemplate.getCollection(PROCESS_DATA_COLLECTION).insertMany(remainBatch);
                processedCount.addAndGet(remainBatch.size());
            }, executor);
            futures.add(future);
        }

        // 모든 병렬 작업 완료 대기
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        executor.shutdown();

        // 6. 세션 단계 업데이트
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElse(null);
        if (session != null) {
            session.setCurrentStep(ProcessStep.PREPROCESSING);
            session.setUpdatedAt(LocalDateTime.now());
            fileSessionRepository.save(session);
        }

        long elapsed = System.currentTimeMillis() - startTime;

        // Redis 완료 상태
        Map<String, Object> doneStatus = new HashMap<>();
        doneStatus.put("status", "COMPLETED");
        doneStatus.put("totalCount", totalCount);
        doneStatus.put("processedCount", processedCount.get());
        doneStatus.put("progress", 100);
        doneStatus.put("elapsedMs", elapsed);
        doneStatus.put("visibleColumns", new ArrayList<>(visibleColumns));
        doneStatus.put("currentStep", "PREPROCESSING");
        redisService.set(statusKey, doneStatus, PROCESS_STATUS_TTL);

        log.info("process_data 생성 완료: sessionId={}, {}건, {}ms",
                sessionId, processedCount.get(), elapsed);
    }

    /**
     * process_data 생성 진행 상태 조회 (Redis 폴링)
     */
    public Map<String, Object> getProcessDataStatus(String sessionId) {
        String statusKey = PROCESS_STATUS_PREFIX + sessionId;
        @SuppressWarnings("unchecked")
        Map<String, Object> status = (Map<String, Object>) redisService.get(statusKey);
        if (status != null) {
            return status;
        }

        // Redis에 상태 없으면 DB에서 확인
        long count = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION)
                .countDocuments(new Document("session_id", sessionId));
        Map<String, Object> result = new HashMap<>();
        if (count > 0) {
            result.put("status", "COMPLETED");
            result.put("processedCount", count);
            result.put("progress", 100);
        } else {
            result.put("status", "NOT_STARTED");
            result.put("processedCount", 0);
            result.put("progress", 0);
        }
        return result;
    }

    /**
     * process_data 삭제 (세션 삭제 시)
     */
    public void deleteProcessData(String sessionId) {
        processDataRepository.deleteBySessionId(sessionId);
        log.info("process_data 삭제: sessionId={}", sessionId);
    }
}
