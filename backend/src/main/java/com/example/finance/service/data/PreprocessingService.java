package com.example.finance.service.data;

import com.example.finance.exception.BusinessException;
import com.example.finance.model.data.PreprocessingConfigDocument;
import com.example.finance.model.data.PreprocessingConfigDocument.ConfigItem;
import com.example.finance.model.session.FileSession;
import com.example.finance.repository.data.PreprocessingConfigRepository;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.service.common.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.mongodb.client.model.UpdateOneModel;
import com.mongodb.client.model.WriteModel;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

import org.openkoreantext.processor.KoreanTokenJava;
import org.openkoreantext.processor.OpenKoreanTextProcessorJava;
import org.openkoreantext.processor.tokenizer.KoreanTokenizer;
import scala.collection.Seq;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * 전처리 서비스 (Step 3: Preprocessing)
 *
 * 기능:
 * 1. process_data 페이징 조회 (타겟열 원본) + process_view_data (키워드 결과)
 * 2. 구분자/불용어 설정 관리 (세션별)
 * 3. 키워드 추출 → process_view_data에 직접 저장
 * 4. 1글자 제거 → process_view_data에서 처리
 * 5. NLP 키워드 재분할 → process_view_data에서 처리
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PreprocessingService {

    private final MongoTemplate mongoTemplate;
    private final FileSessionRepository fileSessionRepository;
    private final PreprocessingConfigRepository configRepository;
    private final RedisService redisService;

    private static final String EXTRACT_PROGRESS_KEY = "preprocessing:extract:";
    private static final String SINGLE_CHAR_PROGRESS_KEY = "preprocessing:singlechar:";
    private static final String NLP_PROGRESS_KEY = "preprocessing:nlp:";

    private static final String PROCESS_DATA_COLLECTION = "process_data";
    private static final String PROCESS_VIEW_DATA_COLLECTION = "process_view_data";
    private static final int THREAD_POOL_SIZE = Math.max(8, Runtime.getRuntime().availableProcessors());
    private static final int BATCH_SIZE = 10_000;

    /**
     * Redis에 진행 상태 업데이트
     */
    private void updateProgress(String key, String status, long totalCount, long processedCount) {
        Map<String, Object> progress = new HashMap<>();
        progress.put("status", status);
        progress.put("totalCount", totalCount);
        progress.put("processedCount", processedCount);
        int pct = totalCount > 0 ? (int) (processedCount * 100 / totalCount) : 0;
        progress.put("progress", Math.min(pct, status.equals("COMPLETED") ? 100 : 99));
        redisService.set(key, progress, java.time.Duration.ofMinutes(10));
    }

    /**
     * 진행 상태 조회
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getExtractProgress(String sessionId, String type) {
        String key = ("nlp".equals(type) ? NLP_PROGRESS_KEY : EXTRACT_PROGRESS_KEY) + sessionId;
        Object val = redisService.get(key);
        if (val instanceof Map) {
            return (Map<String, Object>) val;
        }
        Map<String, Object> defaultStatus = new HashMap<>();
        defaultStatus.put("status", "IDLE");
        defaultStatus.put("progress", 0);
        return defaultStatus;
    }

    // 기본 구분자
    private static final List<String> DEFAULT_SEPARATORS = Arrays.asList(
            " ", ",", ".", "/", "(", ")", "*", "#", "~", "[", "]", "!", ":", "%", "-", "'", "&"
    );

    // 기본 불용어
    private static final List<String> DEFAULT_STOPWORDS = Arrays.asList(
            "12월", "11월", "10월", "9월", "8월", "7월", "6월", "5월", "4월", "3월", "2월", "1월",
            "9명", "8명", "7명", "6명", "5명", "4명", "3명", "2명", "1명", "0명",
            "1년", "2년", "3년", "4년", "5년", "6년", "7년", "8년", "9년",
            "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"
    );

    // ========== 1. 세션 정보 조회 ==========

    public Map<String, Object> getSessionInfo(String sessionId) {
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException("SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        Map<String, Object> info = new HashMap<>();
        info.put("sessionId", session.getSessionId());
        info.put("sessionName", session.getSessionName());
        info.put("totalRowCount", session.getTotalRowCount());
        info.put("totalAmount", session.getTotalAmount());
        info.put("currentStep", session.getCurrentStep());
        info.put("categoryColumn", session.getCategoryColumn());
        info.put("costCenterColumn", session.getCostCenterColumn());
        info.put("supplierColumn", session.getSupplierColumn());
        info.put("amountColumn", session.getAmountColumn());
        info.put("targetColumn", session.getTargetColumn());
        return info;
    }

    // ========== 2. process_data + process_view_data 페이징 조회 ==========

    /**
     * 페이징 조회
     * - 타겟 테이블: process_data에서 원본 targetColumn 데이터
     * - 결과 테이블: process_view_data에서 키워드 + money/department/supplier
     *   (process_view_data가 없으면 process_data 원본 표시)
     */
    public Map<String, Object> getProcessData(String sessionId, int page, int size) {
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException("SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        String targetCol = session.getTargetColumn();
        String costCenterCol = session.getCostCenterColumn();
        String supplierCol = session.getSupplierColumn();

        // process_data 페이징
        Document matchFilter = new Document("session_id", sessionId)
                .append("is_hidden", false);

        // ★ 병렬: countDocuments와 find를 동시에 실행
        CompletableFuture<Long> countFuture = CompletableFuture.supplyAsync(
                () -> mongoTemplate.getCollection(PROCESS_DATA_COLLECTION).countDocuments(matchFilter));

        List<Document> docs = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION)
                .find(matchFilter)
                .sort(new Document("_id", 1))
                .skip(page * size)
                .limit(size)
                .into(new ArrayList<>());

        long totalCount;
        try {
            totalCount = countFuture.get(10, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("countDocuments 병렬 조회 실패, 동기 fallback", e);
            totalCount = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION).countDocuments(matchFilter);
        }
        int totalPages = (int) Math.ceil((double) totalCount / size);

        // 현재 페이지의 process_data ID 목록
        List<String> processDataIds = docs.stream()
                .map(d -> d.getObjectId("_id").toString())
                .toList();

        // process_view_data 일괄 조회 (process_data_id 기준)
        Map<String, Document> viewDataMap = new HashMap<>();
        if (!processDataIds.isEmpty()) {
            List<Document> viewDocs = mongoTemplate.getCollection(PROCESS_VIEW_DATA_COLLECTION)
                    .find(new Document("process_data_id", new Document("$in", processDataIds)))
                    .into(new ArrayList<>());
            for (Document vd : viewDocs) {
                viewDataMap.put(vd.getString("process_data_id"), vd);
            }
        }

        List<Map<String, Object>> targetData = new ArrayList<>();
        List<Map<String, Object>> resultData = new ArrayList<>();
        int maxKeywordCols = 0;

        int rowNum = page * size + 1;
        for (Document doc : docs) {
            Document data = (Document) doc.get("data");
            if (data == null) {
                rowNum++;
                continue;
            }

            String pdId = doc.getObjectId("_id").toString();

            // 타겟 테이블 (항상 process_data 원본)
            Map<String, Object> targetRow = new LinkedHashMap<>();
            targetRow.put("_rowNum", rowNum);
            targetRow.put("_id", pdId);
            if (targetCol != null && data.containsKey(targetCol)) {
                targetRow.put(targetCol, data.get(targetCol));
            }
            targetData.add(targetRow);

            // 결과 테이블
            Map<String, Object> resultRow = new LinkedHashMap<>();
            resultRow.put("_rowNum", rowNum);
            resultRow.put("_id", pdId);

            Document viewDoc = viewDataMap.get(pdId);
            if (viewDoc != null) {
                // process_view_data 존재 → 키워드 결과 표시
                String dept = viewDoc.getString("department");
                String supp = viewDoc.getString("supplier");
                if (costCenterCol != null && dept != null) {
                    resultRow.put(costCenterCol, dept);
                }
                if (supplierCol != null && supp != null) {
                    resultRow.put(supplierCol, supp);
                }

                Document keywords = (Document) viewDoc.get("keywords");
                @SuppressWarnings("unchecked")
                List<String> finalKeywords = keywords != null
                        ? (List<String>) keywords.get("final_keywords")
                        : List.of();
                for (int i = 0; i < finalKeywords.size(); i++) {
                    resultRow.put("c" + i, finalKeywords.get(i));
                }
                if (finalKeywords.size() > maxKeywordCols) {
                    maxKeywordCols = finalKeywords.size();
                }
            } else {
                // process_view_data 없음 → 원본 데이터 표시
                if (costCenterCol != null && data.containsKey(costCenterCol)) {
                    resultRow.put(costCenterCol, data.get(costCenterCol));
                }
                if (supplierCol != null && data.containsKey(supplierCol)) {
                    resultRow.put(supplierCol, data.get(supplierCol));
                }
                if (targetCol != null && data.containsKey(targetCol)) {
                    resultRow.put(targetCol, data.get(targetCol));
                }
            }

            resultData.add(resultRow);
            rowNum++;
        }

        Map<String, Object> result = new HashMap<>();
        result.put("targetData", targetData);
        result.put("resultData", resultData);
        result.put("totalCount", totalCount);
        result.put("totalPages", totalPages);
        result.put("currentPage", page);
        result.put("pageSize", size);
        result.put("maxKeywordCols", maxKeywordCols);
        result.put("targetColumn", targetCol);
        result.put("costCenterColumn", costCenterCol);
        result.put("supplierColumn", supplierCol);
        return result;
    }

    // ========== 3. 구분자/불용어 설정 관리 ==========

    /**
     * 구분자/불용어 설정 조회 (없으면 기본값 생성)
     */
    public PreprocessingConfigDocument getOrCreateConfig(String sessionId) {
        return configRepository.findBySessionId(sessionId)
                .orElseGet(() -> {
                    List<ConfigItem> separators = DEFAULT_SEPARATORS.stream()
                            .map(s -> ConfigItem.builder().value(s).checked(true).build())
                            .collect(Collectors.toList());

                    List<ConfigItem> stopwords = DEFAULT_STOPWORDS.stream()
                            .map(s -> ConfigItem.builder().value(s).checked(true).build())
                            .collect(Collectors.toList());

                    PreprocessingConfigDocument config = PreprocessingConfigDocument.builder()
                            .sessionId(sessionId)
                            .separators(separators)
                            .stopwords(stopwords)
                            .createdAt(LocalDateTime.now())
                            .updatedAt(LocalDateTime.now())
                            .build();

                    return configRepository.save(config);
                });
    }

    /**
     * 구분자/불용어 설정 저장
     */
    public PreprocessingConfigDocument saveConfig(String sessionId,
                                                   List<ConfigItem> separators,
                                                   List<ConfigItem> stopwords) {
        PreprocessingConfigDocument config = configRepository.findBySessionId(sessionId)
                .orElse(PreprocessingConfigDocument.builder()
                        .sessionId(sessionId)
                        .createdAt(LocalDateTime.now())
                        .build());

        if (separators != null) {
            config.setSeparators(separators);
        }
        if (stopwords != null) {
            config.setStopwords(stopwords);
        }
        config.setUpdatedAt(LocalDateTime.now());
        return configRepository.save(config);
    }

    // ========== 4. 키워드 추출 → process_view_data에 직접 저장 ==========

    /**
     * 구분자 기반 키워드 추출
     *
     * 1. checked된 불용어를 먼저 ''로 치환
     * 2. checked된 구분자로 split
     * 3. 결과를 process_view_data 컬렉션에 직접 저장 (final_keywords + money/department/supplier)
     *
     * process_data에는 기록하지 않음 → process_view_data가 키워드의 단일 소스
     *
     * @return 처리 결과 (처리 건수, 최대 컬럼 수, 소요시간)
     */
    public Map<String, Object> extractKeywords(String sessionId) {
        long startTime = System.currentTimeMillis();
        log.info("키워드 추출 시작: sessionId={}", sessionId);

        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException("SESSION_NOT_FOUND", "세션을 찾을 수 없습니다"));

        String targetCol = session.getTargetColumn();
        if (targetCol == null || targetCol.isEmpty()) {
            throw new BusinessException("NO_TARGET_COLUMN", "타겟 열이 설정되지 않았습니다.");
        }

        String projectId = session.getProjectId();
        String costCenterCol = session.getCostCenterColumn();
        String supplierCol = session.getSupplierColumn();
        String amountCol = session.getAmountColumn();

        // 설정 조회
        PreprocessingConfigDocument config = getOrCreateConfig(sessionId);
        List<String> activeSeparators = config.getSeparators().stream()
                .filter(s -> Boolean.TRUE.equals(s.getChecked()))
                .map(ConfigItem::getValue)
                .collect(Collectors.toList());
        List<String> activeStopwords = config.getStopwords().stream()
                .filter(s -> Boolean.TRUE.equals(s.getChecked()))
                .map(ConfigItem::getValue)
                .collect(Collectors.toList());

        // 불용어를 길이 역순 정렬 (긴 것 먼저 제거 - "12월"이 "1"보다 먼저)
        activeStopwords.sort((a, b) -> b.length() - a.length());

        log.info("활성 구분자: {}, 활성 불용어: {}개", activeSeparators, activeStopwords.size());

        // 구분자 regex 패턴 사전 컴파일
        java.util.regex.Pattern separatorPattern = null;
        if (!activeSeparators.isEmpty()) {
            String patternStr = activeSeparators.stream()
                    .map(s -> java.util.regex.Pattern.quote(s))
                    .collect(Collectors.joining("|"));
            separatorPattern = java.util.regex.Pattern.compile(patternStr);
        }

        // 기존 process_view_data 삭제 (deleteMany 대신 조건별 대량 삭제를 비동기로)
        CompletableFuture<Void> deleteFuture = CompletableFuture.runAsync(() -> {
            long deleteStart = System.currentTimeMillis();
            mongoTemplate.getCollection(PROCESS_VIEW_DATA_COLLECTION)
                    .deleteMany(new Document("session_id", sessionId));
            log.info("기존 process_view_data 삭제 완료: {}ms", System.currentTimeMillis() - deleteStart);
        });

        // 진행 상태 초기화
        String progressKey = EXTRACT_PROGRESS_KEY + sessionId;
        Document matchFilter = new Document("session_id", sessionId).append("is_hidden", false);
        long totalCount = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION).countDocuments(matchFilter);
        updateProgress(progressKey, "PROCESSING", totalCount, 0);

        // 삭제 완료 대기
        deleteFuture.join();

        ExecutorService executor = Executors.newFixedThreadPool(THREAD_POOL_SIZE);
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        AtomicInteger maxCols = new AtomicInteger(0);
        AtomicInteger processedCount = new AtomicInteger(0);

        List<Document> insertBatch = new ArrayList<>(BATCH_SIZE);
        LocalDateTime now = LocalDateTime.now();

        // ★ 불용어를 하나의 regex로 통합 (각 row마다 N번 replace 대신 1번 replaceAll)
        java.util.regex.Pattern stopwordPattern = null;
        if (!activeStopwords.isEmpty()) {
            String swPatternStr = activeStopwords.stream()
                    .map(java.util.regex.Pattern::quote)
                    .collect(Collectors.joining("|"));
            stopwordPattern = java.util.regex.Pattern.compile(swPatternStr);
        }
        final java.util.regex.Pattern finalStopwordPattern = stopwordPattern;

        try (var cursor = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION)
                .find(matchFilter).batchSize(10000).cursor()) {

            while (cursor.hasNext()) {
                Document doc = cursor.next();
                Document data = (Document) doc.get("data");
                if (data == null) continue;

                Object targetValue = data.get(targetCol);
                String text = targetValue != null ? targetValue.toString() : "";

                // 1. 불용어 제거 (★ 단일 regex로 한번에)
                if (finalStopwordPattern != null) {
                    text = finalStopwordPattern.matcher(text).replaceAll("");
                }

                // 2. 사전 컴파일된 패턴으로 split
                String[] keywords;
                if (separatorPattern != null) {
                    keywords = separatorPattern.split(text);
                } else {
                    keywords = new String[]{text};
                }

                // 빈 문자열 제거
                List<String> cleanKeywords = new ArrayList<>();
                for (String kw : keywords) {
                    String trimmed = kw.trim();
                    if (!trimmed.isEmpty()) {
                        cleanKeywords.add(trimmed);
                    }
                }

                if (cleanKeywords.size() > maxCols.get()) {
                    maxCols.set(cleanKeywords.size());
                }

                // money, department, supplier 추출
                String money = amountCol != null && data.containsKey(amountCol)
                        ? String.valueOf(data.get(amountCol)) : null;
                String department = costCenterCol != null && data.containsKey(costCenterCol)
                        ? String.valueOf(data.get(costCenterCol)) : null;
                String supplier = supplierCol != null && data.containsKey(supplierCol)
                        ? String.valueOf(data.get(supplierCol)) : null;

                // process_view_data 문서 생성
                Document viewDoc = new Document()
                        .append("session_id", sessionId)
                        .append("project_id", projectId)
                        .append("process_data_id", doc.getObjectId("_id").toString())
                        .append("raw_data_id", doc.get("raw_data_id") != null ? doc.get("raw_data_id").toString() : null)
                        .append("keywords", new Document("final_keywords", cleanKeywords))
                        .append("money", money)
                        .append("department", department)
                        .append("supplier", supplier)
                        .append("last_modified_date", now);

                insertBatch.add(viewDoc);

                if (insertBatch.size() >= BATCH_SIZE) {
                    List<Document> batch = new ArrayList<>(insertBatch);
                    insertBatch.clear();
                    final long tc = totalCount;
                    final String pk = progressKey;
                    CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                        mongoTemplate.getCollection(PROCESS_VIEW_DATA_COLLECTION)
                                .insertMany(batch, new com.mongodb.client.model.InsertManyOptions().ordered(false));
                        long current = processedCount.addAndGet(batch.size());
                        updateProgress(pk, "PROCESSING", tc, current);
                    }, executor);
                    futures.add(future);
                }
            }
        }

        // 잔여 배치
        if (!insertBatch.isEmpty()) {
            List<Document> batch = new ArrayList<>(insertBatch);
            final long tc = totalCount;
            final String pk = progressKey;
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                mongoTemplate.getCollection(PROCESS_VIEW_DATA_COLLECTION)
                        .insertMany(batch, new com.mongodb.client.model.InsertManyOptions().ordered(false));
                long current = processedCount.addAndGet(batch.size());
                updateProgress(pk, "PROCESSING", tc, current);
            }, executor);
            futures.add(future);
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        executor.shutdown();

        long elapsed = System.currentTimeMillis() - startTime;
        log.info("키워드 추출 완료: sessionId={}, {}건, maxCols={}, {}ms",
                sessionId, processedCount.get(), maxCols.get(), elapsed);

        updateProgress(progressKey, "COMPLETED", totalCount, totalCount);

        Map<String, Object> result = new HashMap<>();
        result.put("processedCount", processedCount.get());
        result.put("totalCount", totalCount);
        result.put("maxKeywordCols", maxCols.get());
        result.put("elapsedMs", elapsed);
        return result;
    }

    // ========== 5. 1글자 제거 (process_view_data 대상) ==========

    /**
     * 키워드 추출 결과에서 1글자 항목을 제거
     * process_view_data.keywords.final_keywords 리스트에서 1글자 항목 필터링
     */
    public Map<String, Object> removeSingleCharKeywords(String sessionId) {
        long startTime = System.currentTimeMillis();
        log.info("1글자 제거 시작: sessionId={}", sessionId);

        // ★ 진행 상태 추가
        String progressKey = SINGLE_CHAR_PROGRESS_KEY + sessionId;
        long totalCount = mongoTemplate.getCollection(PROCESS_VIEW_DATA_COLLECTION)
                .countDocuments(new Document("session_id", sessionId));
        updateProgress(progressKey, "PROCESSING", totalCount, 0);

        ExecutorService executor = Executors.newFixedThreadPool(THREAD_POOL_SIZE);
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        AtomicInteger removedCount = new AtomicInteger(0);
        AtomicInteger processedCount = new AtomicInteger(0);
        List<Document[]> updateBatch = new ArrayList<>(BATCH_SIZE);
        LocalDateTime now = LocalDateTime.now();

        try (var cursor = mongoTemplate.getCollection(PROCESS_VIEW_DATA_COLLECTION)
                .find(new Document("session_id", sessionId)).batchSize(10000).cursor()) {

            while (cursor.hasNext()) {
                Document viewDoc = cursor.next();
                Document keywords = (Document) viewDoc.get("keywords");
                if (keywords == null) continue;

                @SuppressWarnings("unchecked")
                List<String> finalKeywords = (List<String>) keywords.get("final_keywords");
                if (finalKeywords == null || finalKeywords.isEmpty()) continue;

                // 1글자 항목 필터링
                List<String> filtered = new ArrayList<>();
                int removed = 0;
                for (String kw : finalKeywords) {
                    if (kw != null && kw.length() == 1) {
                        removed++;
                    } else {
                        filtered.add(kw);
                    }
                }

                if (removed == 0) continue;

                // ★ 모든 키워드가 1글자라 전부 제거된 경우 → "키워드없음" 표시
                if (filtered.isEmpty()) {
                    filtered.add("키워드없음");
                }

                removedCount.addAndGet(removed);

                updateBatch.add(new Document[]{
                        new Document("_id", viewDoc.getObjectId("_id")),
                        new Document("$set", new Document("keywords.final_keywords", filtered)
                                .append("last_modified_date", now))
                });

                if (updateBatch.size() >= BATCH_SIZE) {
                    List<Document[]> batch = new ArrayList<>(updateBatch);
                    updateBatch.clear();
                    final long tc = totalCount;
                    final String pk = progressKey;
                    CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                        executeBatchUpdate(PROCESS_VIEW_DATA_COLLECTION, batch);
                        long current = processedCount.addAndGet(batch.size());
                        updateProgress(pk, "PROCESSING", tc, current);
                    }, executor);
                    futures.add(future);
                }
            }
        }

        if (!updateBatch.isEmpty()) {
            List<Document[]> batch = new ArrayList<>(updateBatch);
            final long tc = totalCount;
            final String pk = progressKey;
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                executeBatchUpdate(PROCESS_VIEW_DATA_COLLECTION, batch);
                long current = processedCount.addAndGet(batch.size());
                updateProgress(pk, "PROCESSING", tc, current);
            }, executor);
            futures.add(future);
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        executor.shutdown();

        long elapsed = System.currentTimeMillis() - startTime;
        log.info("1글자 제거 완료: sessionId={}, 제거={}건, 처리={}건, {}ms",
                sessionId, removedCount.get(), processedCount.get(), elapsed);

        updateProgress(progressKey, "COMPLETED", totalCount, totalCount);

        Map<String, Object> result = new HashMap<>();
        result.put("removedCount", removedCount.get());
        result.put("processedCount", processedCount.get());
        result.put("elapsedMs", elapsed);
        return result;
    }

    // ========== 6. NLP 기반 키워드 추출 (process_view_data 대상) ==========

    /**
     * NLP(형태소 분석) 기반 키워드 재분할
     *
     * process_view_data의 keywords.final_keywords에서 minKeywordLength 글자 이상인 키워드를
     * Open Korean Text(Okt) 형태소 분석기로 재분할합니다.
     *
     * 처리 흐름:
     * 1. process_view_data의 각 row에서 final_keywords 리스트를 읽음
     * 2. 각 키워드가 minKeywordLength 이상이면 Okt로 명사/형용사 추출
     * 3. 결과를 다시 final_keywords로 갱신
     */
    public Map<String, Object> extractKeywordsNlp(String sessionId, int minKeywordLength) {
        long startTime = System.currentTimeMillis();
        log.info("NLP 키워드 추출 시작: sessionId={}, minLen={}", sessionId, minKeywordLength);

        String progressKey = NLP_PROGRESS_KEY + sessionId;
        long totalCount = mongoTemplate.getCollection(PROCESS_VIEW_DATA_COLLECTION)
                .countDocuments(new Document("session_id", sessionId));
        updateProgress(progressKey, "PROCESSING", totalCount, 0);

        ExecutorService executor = Executors.newFixedThreadPool(THREAD_POOL_SIZE);
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        AtomicInteger maxCols = new AtomicInteger(0);
        AtomicInteger processedCount = new AtomicInteger(0);
        AtomicInteger splitCount = new AtomicInteger(0);

        List<Document[]> updateBatch = new ArrayList<>(BATCH_SIZE);
        LocalDateTime now = LocalDateTime.now();

        try (var cursor = mongoTemplate.getCollection(PROCESS_VIEW_DATA_COLLECTION)
                .find(new Document("session_id", sessionId)).batchSize(10000).cursor()) {

            while (cursor.hasNext()) {
                Document viewDoc = cursor.next();
                Document keywords = (Document) viewDoc.get("keywords");
                if (keywords == null) continue;

                @SuppressWarnings("unchecked")
                List<String> existingKeywords = (List<String>) keywords.get("final_keywords");
                if (existingKeywords == null || existingKeywords.isEmpty()) continue;

                // NLP 재분할
                List<String> newKeywords = new ArrayList<>();
                boolean hasChange = false;

                for (String keyword : existingKeywords) {
                    if (keyword == null || keyword.isEmpty()) {
                        newKeywords.add(keyword);
                        continue;
                    }

                    // ★ "키워드없음"은 특수 플레이스홀더이므로 NLP 분석 대상에서 제외
                    if ("키워드없음".equals(keyword)) {
                        newKeywords.add(keyword);
                        continue;
                    }

                    if (keyword.length() >= minKeywordLength) {
                        List<String> morphemes = extractMorphemes(keyword);
                        if (morphemes.size() > 1) {
                            newKeywords.addAll(morphemes);
                            hasChange = true;
                            splitCount.incrementAndGet();
                        } else {
                            newKeywords.add(keyword);
                        }
                    } else {
                        newKeywords.add(keyword);
                    }
                }

                if (!hasChange) continue;

                if (newKeywords.size() > maxCols.get()) {
                    maxCols.set(newKeywords.size());
                }

                updateBatch.add(new Document[]{
                        new Document("_id", viewDoc.getObjectId("_id")),
                        new Document("$set", new Document("keywords.final_keywords", newKeywords)
                                .append("last_modified_date", now))
                });

                if (updateBatch.size() >= BATCH_SIZE) {
                    List<Document[]> batch = new ArrayList<>(updateBatch);
                    updateBatch.clear();
                    final long tc = totalCount;
                    final String pk = progressKey;
                    CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                        executeBatchUpdate(PROCESS_VIEW_DATA_COLLECTION, batch);
                        long current = processedCount.addAndGet(batch.size());
                        updateProgress(pk, "PROCESSING", tc, current);
                    }, executor);
                    futures.add(future);
                }
            }
        }

        // 잔여 배치
        if (!updateBatch.isEmpty()) {
            List<Document[]> batch = new ArrayList<>(updateBatch);
            final long tc = totalCount;
            final String pk = progressKey;
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                executeBatchUpdate(PROCESS_VIEW_DATA_COLLECTION, batch);
                long current = processedCount.addAndGet(batch.size());
                updateProgress(pk, "PROCESSING", tc, current);
            }, executor);
            futures.add(future);
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        executor.shutdown();

        long elapsed = System.currentTimeMillis() - startTime;
        log.info("NLP 키워드 추출 완료: sessionId={}, 변경={}건, 분할={}건, maxCols={}, {}ms",
                sessionId, processedCount.get(), splitCount.get(), maxCols.get(), elapsed);

        updateProgress(progressKey, "COMPLETED", totalCount, totalCount);

        Map<String, Object> result = new HashMap<>();
        result.put("processedCount", processedCount.get());
        result.put("totalCount", totalCount);
        result.put("splitCount", splitCount.get());
        result.put("maxKeywordCols", maxCols.get());
        result.put("elapsedMs", elapsed);
        return result;
    }

    /**
     * Okt 형태소 분석기로 텍스트에서 명사(Noun), 형용사(Adjective), 동사(Verb) 추출
     */
    private List<String> extractMorphemes(String text) {
        try {
            CharSequence normalized = OpenKoreanTextProcessorJava.normalize(text);
            Seq<KoreanTokenizer.KoreanToken> tokens = OpenKoreanTextProcessorJava.tokenize(normalized);
            List<KoreanTokenJava> tokenList = OpenKoreanTextProcessorJava.tokensToJavaKoreanTokenList(tokens);

            List<String> morphemes = new ArrayList<>();
            for (KoreanTokenJava token : tokenList) {
                String pos = token.getPos().toString();
                // 명사, 형용사, 동사, 알파벳, 외래어만 추출
                if ("Noun".equals(pos) || "Adjective".equals(pos) || "Verb".equals(pos)
                        || "Alpha".equals(pos) || "ForeignWord".equals(pos)) {
                    String word = token.getText();
                    if (!word.isEmpty()) {
                        morphemes.add(word);
                    }
                }
            }

            return morphemes.isEmpty() ? List.of(text) : morphemes;
        } catch (Exception e) {
            log.warn("형태소 분석 실패: text={}, error={}", text, e.getMessage());
            return List.of(text);
        }
    }

    /**
     * 배치 업데이트 실행 (bulkWrite로 일괄 처리)
     */
    private void executeBatchUpdate(String collectionName, List<Document[]> batch) {
        var collection = mongoTemplate.getCollection(collectionName);
        List<WriteModel<Document>> bulkOps = new ArrayList<>(batch.size());
        for (Document[] pair : batch) {
            bulkOps.add(new UpdateOneModel<>(pair[0], pair[1]));
        }
        // ★ ordered=false: 순서 무관하게 병렬 처리 → 성능 향상
        collection.bulkWrite(bulkOps, new com.mongodb.client.model.BulkWriteOptions().ordered(false));
    }
}
