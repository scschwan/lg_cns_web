package com.example.finance.service.data;

import com.example.finance.exception.BusinessException;
import com.example.finance.model.data.PreprocessingConfigDocument;
import com.example.finance.model.data.PreprocessingConfigDocument.ConfigItem;
import com.example.finance.model.session.FileSession;
import com.example.finance.repository.data.PreprocessingConfigRepository;
import com.example.finance.repository.session.FileSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.mongodb.client.model.UpdateOneModel;
import com.mongodb.client.model.WriteModel;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

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
 * 1. process_data 페이징 조회 (타겟열 / 결과 테이블)
 * 2. 구분자/불용어 설정 관리 (세션별)
 * 3. 키워드 추출 (구분자 기반 split + 불용어 제거)
 * 4. 1글자 제거
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PreprocessingService {

    private final MongoTemplate mongoTemplate;
    private final FileSessionRepository fileSessionRepository;
    private final PreprocessingConfigRepository configRepository;

    private static final String PROCESS_DATA_COLLECTION = "process_data";
    private static final int THREAD_POOL_SIZE = 4;
    private static final int BATCH_SIZE = 5_000;

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

    // ========== 2. process_data 페이징 조회 ==========

    /**
     * process_data 페이징 조회 (두 테이블 동시에 사용)
     * - 타겟 테이블: targetColumn 데이터만
     * - 결과 테이블: costCenter + supplier + 키워드 분할 컬럼 (c0, c1, ...)
     */
    public Map<String, Object> getProcessData(String sessionId, int page, int size) {
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException("SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        String targetCol = session.getTargetColumn();
        String costCenterCol = session.getCostCenterColumn();
        String supplierCol = session.getSupplierColumn();

        // 전체 건수
        Document matchFilter = new Document("session_id", sessionId)
                .append("is_hidden", false);
        long totalCount = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION).countDocuments(matchFilter);
        int totalPages = (int) Math.ceil((double) totalCount / size);

        // 페이징 조회
        List<Document> docs = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION)
                .find(matchFilter)
                .skip(page * size)
                .limit(size)
                .into(new ArrayList<>());

        // 타겟 테이블 데이터
        List<Map<String, Object>> targetData = new ArrayList<>();
        // 결과 테이블 데이터
        List<Map<String, Object>> resultData = new ArrayList<>();
        // 최대 keyword 컬럼 수 추적
        int maxKeywordCols = 0;

        int rowNum = page * size + 1;
        for (Document doc : docs) {
            Document data = (Document) doc.get("data");
            if (data == null) {
                rowNum++;
                continue;
            }

            // 타겟 테이블
            Map<String, Object> targetRow = new LinkedHashMap<>();
            targetRow.put("_rowNum", rowNum);
            targetRow.put("_id", doc.getObjectId("_id").toString());
            if (targetCol != null && data.containsKey(targetCol)) {
                targetRow.put(targetCol, data.get(targetCol));
            }
            targetData.add(targetRow);

            // 결과 테이블
            Map<String, Object> resultRow = new LinkedHashMap<>();
            resultRow.put("_rowNum", rowNum);
            resultRow.put("_id", doc.getObjectId("_id").toString());
            if (costCenterCol != null && data.containsKey(costCenterCol)) {
                resultRow.put(costCenterCol, data.get(costCenterCol));
            }
            if (supplierCol != null && data.containsKey(supplierCol)) {
                resultRow.put(supplierCol, data.get(supplierCol));
            }
            if (targetCol != null && data.containsKey(targetCol)) {
                resultRow.put(targetCol, data.get(targetCol));
            }

            // keyword 분할 컬럼 (c0, c1, ...)이 data에 있으면 추가
            int colIdx = 0;
            while (data.containsKey("c" + colIdx)) {
                resultRow.put("c" + colIdx, data.get("c" + colIdx));
                colIdx++;
            }
            if (colIdx > maxKeywordCols) {
                maxKeywordCols = colIdx;
            }

            resultData.add(resultRow);
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

    // ========== 4. 키워드 추출 ==========

    /**
     * 구분자 기반 키워드 추출
     *
     * 1. checked된 불용어를 먼저 ''로 치환
     * 2. checked된 구분자로 split
     * 3. 결과를 c0, c1, c2... 컬럼으로 process_data.data에 저장
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

        // process_data 커서 순회 + 배치 업데이트
        Document matchFilter = new Document("session_id", sessionId).append("is_hidden", false);
        long totalCount = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION).countDocuments(matchFilter);

        ExecutorService executor = Executors.newFixedThreadPool(THREAD_POOL_SIZE);
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        AtomicInteger maxCols = new AtomicInteger(0);
        AtomicInteger processedCount = new AtomicInteger(0);

        List<Document[]> updateBatch = new ArrayList<>(BATCH_SIZE);

        try (var cursor = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION)
                .find(matchFilter).batchSize(5000).cursor()) {

            while (cursor.hasNext()) {
                Document doc = cursor.next();
                Document data = (Document) doc.get("data");
                if (data == null) continue;

                Object targetValue = data.get(targetCol);
                String text = targetValue != null ? targetValue.toString() : "";

                // 1. 불용어 제거
                for (String stopword : activeStopwords) {
                    text = text.replace(stopword, "");
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

                // 기존 cn 컬럼 중 새 키워드 수보다 큰 인덱스만 $unset으로 제거
                // (MongoDB는 $set과 $unset에 같은 경로가 있으면 에러)
                Document setFields = new Document();
                Document unsetFields = new Document();

                // 새 cn 컬럼 세팅
                for (int i = 0; i < cleanKeywords.size(); i++) {
                    setFields.append("data.c" + i, cleanKeywords.get(i));
                }

                // 기존 cn 컬럼 중 새 키워드 개수 이후의 컬럼만 제거
                for (int i = cleanKeywords.size(); i < 100; i++) {
                    String key = "data.c" + i;
                    if (data.containsKey("c" + i)) {
                        unsetFields.append(key, "");
                    }
                }

                if (cleanKeywords.size() > maxCols.get()) {
                    maxCols.set(cleanKeywords.size());
                }

                Document update = new Document();
                if (!unsetFields.isEmpty()) {
                    update.append("$unset", unsetFields);
                }
                if (!setFields.isEmpty()) {
                    update.append("$set", setFields);
                }

                updateBatch.add(new Document[]{
                        new Document("_id", doc.getObjectId("_id")),
                        update
                });

                if (updateBatch.size() >= BATCH_SIZE) {
                    List<Document[]> batch = new ArrayList<>(updateBatch);
                    updateBatch.clear();
                    CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                        executeBatchUpdate(batch);
                        processedCount.addAndGet(batch.size());
                    }, executor);
                    futures.add(future);
                }
            }
        }

        // 잔여 배치
        if (!updateBatch.isEmpty()) {
            List<Document[]> batch = new ArrayList<>(updateBatch);
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                executeBatchUpdate(batch);
                processedCount.addAndGet(batch.size());
            }, executor);
            futures.add(future);
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        executor.shutdown();

        long elapsed = System.currentTimeMillis() - startTime;
        log.info("키워드 추출 완료: sessionId={}, {}건, maxCols={}, {}ms",
                sessionId, processedCount.get(), maxCols.get(), elapsed);

        Map<String, Object> result = new HashMap<>();
        result.put("processedCount", processedCount.get());
        result.put("totalCount", totalCount);
        result.put("maxKeywordCols", maxCols.get());
        result.put("elapsedMs", elapsed);
        return result;
    }

    /**
     * 배치 업데이트 실행 (bulkWrite로 일괄 처리)
     */
    private void executeBatchUpdate(List<Document[]> batch) {
        var collection = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION);
        List<WriteModel<Document>> bulkOps = new ArrayList<>(batch.size());
        for (Document[] pair : batch) {
            bulkOps.add(new UpdateOneModel<>(pair[0], pair[1]));
        }
        collection.bulkWrite(bulkOps);
    }

    // ========== 5. 1글자 제거 ==========

    /**
     * 키워드 추출 결과에서 1글자 항목을 null로 치환
     */
    public Map<String, Object> removeSingleCharKeywords(String sessionId) {
        long startTime = System.currentTimeMillis();
        log.info("1글자 제거 시작: sessionId={}", sessionId);

        Document matchFilter = new Document("session_id", sessionId).append("is_hidden", false);

        ExecutorService executor = Executors.newFixedThreadPool(THREAD_POOL_SIZE);
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        AtomicInteger removedCount = new AtomicInteger(0);
        List<Document[]> updateBatch = new ArrayList<>(BATCH_SIZE);

        try (var cursor = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION)
                .find(matchFilter).batchSize(5000).cursor()) {

            while (cursor.hasNext()) {
                Document doc = cursor.next();
                Document data = (Document) doc.get("data");
                if (data == null) continue;

                Document setFields = new Document();
                boolean hasChange = false;

                for (int i = 0; i < 100; i++) {
                    String key = "c" + i;
                    if (!data.containsKey(key)) break;

                    Object val = data.get(key);
                    if (val != null && val.toString().length() == 1) {
                        setFields.append("data." + key, null);
                        hasChange = true;
                        removedCount.incrementAndGet();
                    }
                }

                if (hasChange) {
                    updateBatch.add(new Document[]{
                            new Document("_id", doc.getObjectId("_id")),
                            new Document("$set", setFields)
                    });
                }

                if (updateBatch.size() >= BATCH_SIZE) {
                    List<Document[]> batch = new ArrayList<>(updateBatch);
                    updateBatch.clear();
                    CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                        executeBatchUpdate(batch);
                    }, executor);
                    futures.add(future);
                }
            }
        }

        if (!updateBatch.isEmpty()) {
            List<Document[]> batch = new ArrayList<>(updateBatch);
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                executeBatchUpdate(batch);
            }, executor);
            futures.add(future);
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        executor.shutdown();

        long elapsed = System.currentTimeMillis() - startTime;
        log.info("1글자 제거 완료: sessionId={}, 제거={}건, {}ms", sessionId, removedCount.get(), elapsed);

        Map<String, Object> result = new HashMap<>();
        result.put("removedCount", removedCount.get());
        result.put("elapsedMs", elapsed);
        return result;
    }

    // ========== 6. NLP 기반 키워드 추출 ==========

    /**
     * NLP(형태소 분석) 기반 키워드 재분할
     *
     * 구분자 추출로 만들어진 cn 컬럼 중 minKeywordLength 글자 이상인 키워드를
     * Open Korean Text(Okt) 형태소 분석기로 재분할합니다.
     *
     * 처리 흐름:
     * 1. process_data의 각 row에서 c0, c1, ... cn 컬럼을 읽음
     * 2. 각 키워드가 minKeywordLength 이상이면 Okt로 명사/형용사 추출
     * 3. 결과를 다시 c0, c1, ... cm으로 재배치하여 저장
     */
    public Map<String, Object> extractKeywordsNlp(String sessionId, int minKeywordLength) {
        long startTime = System.currentTimeMillis();
        log.info("NLP 키워드 추출 시작: sessionId={}, minLen={}", sessionId, minKeywordLength);

        Document matchFilter = new Document("session_id", sessionId).append("is_hidden", false);
        long totalCount = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION).countDocuments(matchFilter);

        ExecutorService executor = Executors.newFixedThreadPool(THREAD_POOL_SIZE);
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        AtomicInteger maxCols = new AtomicInteger(0);
        AtomicInteger processedCount = new AtomicInteger(0);
        AtomicInteger splitCount = new AtomicInteger(0);

        List<Document[]> updateBatch = new ArrayList<>(BATCH_SIZE);

        try (var cursor = mongoTemplate.getCollection(PROCESS_DATA_COLLECTION)
                .find(matchFilter).batchSize(5000).cursor()) {

            while (cursor.hasNext()) {
                Document doc = cursor.next();
                Document data = (Document) doc.get("data");
                if (data == null) continue;

                // 기존 cn 키워드 수집
                List<String> existingKeywords = new ArrayList<>();
                for (int i = 0; i < 100; i++) {
                    if (!data.containsKey("c" + i)) break;
                    Object val = data.get("c" + i);
                    existingKeywords.add(val != null ? val.toString() : null);
                }

                if (existingKeywords.isEmpty()) continue;

                // NLP 재분할
                List<String> newKeywords = new ArrayList<>();
                boolean hasChange = false;

                for (String keyword : existingKeywords) {
                    if (keyword == null || keyword.isEmpty()) {
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

                // 업데이트 문서 생성
                Document setFields = new Document();
                Document unsetFields = new Document();

                for (int i = 0; i < newKeywords.size(); i++) {
                    setFields.append("data.c" + i, newKeywords.get(i));
                }

                // 기존 cn 중 새 키워드 수 이후 제거
                for (int i = newKeywords.size(); i < existingKeywords.size(); i++) {
                    unsetFields.append("data.c" + i, "");
                }

                if (newKeywords.size() > maxCols.get()) {
                    maxCols.set(newKeywords.size());
                }

                Document update = new Document();
                if (!unsetFields.isEmpty()) {
                    update.append("$unset", unsetFields);
                }
                if (!setFields.isEmpty()) {
                    update.append("$set", setFields);
                }

                updateBatch.add(new Document[]{
                        new Document("_id", doc.getObjectId("_id")),
                        update
                });

                if (updateBatch.size() >= BATCH_SIZE) {
                    List<Document[]> batch = new ArrayList<>(updateBatch);
                    updateBatch.clear();
                    CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                        executeBatchUpdate(batch);
                        processedCount.addAndGet(batch.size());
                    }, executor);
                    futures.add(future);
                }
            }
        }

        // 잔여 배치
        if (!updateBatch.isEmpty()) {
            List<Document[]> batch = new ArrayList<>(updateBatch);
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                executeBatchUpdate(batch);
                processedCount.addAndGet(batch.size());
            }, executor);
            futures.add(future);
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        executor.shutdown();

        long elapsed = System.currentTimeMillis() - startTime;
        log.info("NLP 키워드 추출 완료: sessionId={}, 변경={}건, 분할={}건, maxCols={}, {}ms",
                sessionId, processedCount.get(), splitCount.get(), maxCols.get(), elapsed);

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
            List<KoreanTokenizer.KoreanToken> tokenList = OpenKoreanTextProcessorJava.tokensToJavaKoreanTokenList(tokens);

            List<String> morphemes = new ArrayList<>();
            for (KoreanTokenizer.KoreanToken token : tokenList) {
                String pos = token.pos().toString();
                // 명사, 형용사, 동사, 알파벳, 외래어만 추출
                if ("Noun".equals(pos) || "Adjective".equals(pos) || "Verb".equals(pos)
                        || "Alpha".equals(pos) || "ForeignWord".equals(pos)) {
                    String word = token.text();
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
}
