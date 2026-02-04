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

        // 2. MongoDB 조회 (is_hidden=true인 행 제외)
        long startTime = System.currentTimeMillis();

        // is_hidden이 true가 아닌 행만 카운트 (is_hidden 없는 기존 데이터도 포함)
        Query countQuery = new Query(Criteria.where("session_id").is(sessionId)
                .orOperator(
                        Criteria.where("is_hidden").is(false),
                        Criteria.where("is_hidden").exists(false)
                ));
        long totalCount = mongoTemplate.count(countQuery, "session_data");

        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .orOperator(
                        Criteria.where("is_hidden").is(false),
                        Criteria.where("is_hidden").exists(false)
                ))
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
                new Criteria().orOperator(
                        Criteria.where("is_hidden").is(false),
                        Criteria.where("is_hidden").exists(false)
                )
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
                .append("$or", List.of(
                        new Document("is_hidden", false),
                        new Document("is_hidden", new Document("$exists", false))
                ))));
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
                .append("$or", List.of(
                        new Document("is_hidden", false),
                        new Document("is_hidden", new Document("$exists", false))
                ))));
        visiblePipeline.add(new Document("$group", new Document("_id", "$" + fieldPath)
                .append("count", new Document("$sum", 1))));
        visiblePipeline.add(new Document("$sort", new Document("count", -1)));
        visiblePipeline.add(new Document("$limit", 5000));

        List<Document> visibleResults = mongoTemplate.getCollection("session_data")
                .aggregate(visiblePipeline).into(new ArrayList<>());

        List<Map<String, Object>> visibleValues = new ArrayList<>();
        for (Document doc : visibleResults) {
            Object idObj = doc.get("_id");
            if (idObj == null) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("value", idObj.toString());
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
            if (idObj == null) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("value", idObj.toString());
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

        Query query = new Query(new Criteria().andOperator(
                Criteria.where("session_id").is(sessionId),
                Criteria.where(fieldPath).in(values),
                new Criteria().orOperator(
                        Criteria.where("is_hidden").is(false),
                        Criteria.where("is_hidden").exists(false)
                )
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

        Query query = new Query(new Criteria().andOperator(
                Criteria.where("session_id").is(sessionId),
                Criteria.where(fieldPath).in(values),
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
                .append("$or", List.of(
                        new Document("is_hidden", false),
                        new Document("is_hidden", new Document("$exists", false))
                ))));
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
                    new Criteria().orOperator(
                            Criteria.where("is_hidden").is(false),
                            Criteria.where("is_hidden").exists(false)
                    )
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

    /**
     * session_data에서 process_data 생성
     *
     * C# PrepareProcessDataAsync 참고:
     * 1. 기존 process_data 삭제
     * 2. session_data에서 is_hidden=false인 행만 조회
     * 3. visible 컬럼만 추출하여 process_data에 삽입
     * 4. raw_data_id 참조 유지
     *
     * @param sessionId 세션 ID
     * @param requiredColumns 필수 항목 매핑 (category, costCenter, supplier, amount, target)
     * @return 처리 결과
     */
    public Map<String, Object> prepareProcessData(String sessionId, Map<String, String> requiredColumns) {
        log.info("process_data 생성 시작: sessionId={}", sessionId);
        long startTime = System.currentTimeMillis();

        // 1. 세션 조회
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        // 2. 기존 process_data 삭제
        processDataRepository.deleteBySessionId(sessionId);
        log.info("기존 process_data 삭제 완료: sessionId={}", sessionId);

        // 3. visible 컬럼 목록 조회
        List<ColumnMappingDocument> mappings = columnMappingRepository.findBySessionIdOrderBySequenceAsc(sessionId);
        Set<String> visibleColumns = mappings.stream()
                .filter(ColumnMappingDocument::getIsVisible)
                .map(ColumnMappingDocument::getOriginalName)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        if (visibleColumns.isEmpty()) {
            throw new BusinessException("NO_VISIBLE_COLUMNS", "표시할 컬럼이 없습니다.");
        }

        // _id, row_number 제외
        visibleColumns.remove("_id");
        visibleColumns.remove("row_number");

        log.info("visible 컬럼: {}", visibleColumns);

        // 4. session_data에서 is_hidden=false인 행을 커서로 읽어 process_data 생성
        Query query = new Query(new Criteria().andOperator(
                Criteria.where("session_id").is(sessionId),
                new Criteria().orOperator(
                        Criteria.where("is_hidden").is(false),
                        Criteria.where("is_hidden").exists(false)
                )
        ));

        long totalCount = mongoTemplate.count(query, "session_data");
        log.info("처리 대상 session_data: {}건", totalCount);

        // 배치 처리
        List<ProcessDataDocument> batch = new ArrayList<>(BATCH_SIZE);
        AtomicLong processedCount = new AtomicLong(0);

        query.cursorBatchSize(CURSOR_BATCH_SIZE);

        try (var cursor = mongoTemplate.getCollection("session_data")
                .find(query.getQueryObject()).batchSize(CURSOR_BATCH_SIZE).cursor()) {

            while (cursor.hasNext()) {
                Document doc = cursor.next();
                Document dataDoc = (Document) doc.get("data");
                if (dataDoc == null) continue;

                // visible 컬럼만 추출
                Map<String, Object> filteredData = new LinkedHashMap<>();
                for (String col : visibleColumns) {
                    if (dataDoc.containsKey(col)) {
                        filteredData.put(col, dataDoc.get(col));
                    }
                }

                ProcessDataDocument processDoc = ProcessDataDocument.builder()
                        .projectId(session.getProjectId())
                        .sessionId(sessionId)
                        .rawDataId(doc.get("raw_data_id") != null ? doc.get("raw_data_id").toString() : null)
                        .data(filteredData)
                        .isHidden(false)
                        .createdAt(LocalDateTime.now())
                        .build();

                batch.add(processDoc);

                if (batch.size() >= BATCH_SIZE) {
                    processDataRepository.saveAll(batch);
                    processedCount.addAndGet(batch.size());
                    log.debug("process_data 배치 삽입: {}건 / {}건", processedCount.get(), totalCount);
                    batch.clear();
                }
            }
        }

        // 잔여 배치 삽입
        if (!batch.isEmpty()) {
            processDataRepository.saveAll(batch);
            processedCount.addAndGet(batch.size());
        }

        // 5. 세션에 필수 항목 매핑 저장 + 단계 업데이트
        if (requiredColumns != null) {
            session.setCategoryColumn(requiredColumns.getOrDefault("category", null));
            session.setCostCenterColumn(requiredColumns.getOrDefault("costCenter", null));
            session.setSupplierColumn(requiredColumns.getOrDefault("supplier", null));
            session.setAmountColumn(requiredColumns.getOrDefault("amount", null));
            session.setTargetColumn(requiredColumns.getOrDefault("target", null));
        }
        session.setCurrentStep(ProcessStep.PREPROCESSING);
        session.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(session);

        long elapsed = System.currentTimeMillis() - startTime;

        Map<String, Object> result = new HashMap<>();
        result.put("sessionId", sessionId);
        result.put("processedCount", processedCount.get());
        result.put("visibleColumns", visibleColumns);
        result.put("currentStep", "PREPROCESSING");
        result.put("elapsedMs", elapsed);

        log.info("process_data 생성 완료: sessionId={}, {}건, {}ms",
                sessionId, processedCount.get(), elapsed);
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
