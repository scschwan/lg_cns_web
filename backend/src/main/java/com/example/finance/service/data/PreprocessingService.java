package com.example.finance.service.data;

import com.example.finance.model.data.ProcessViewData;
import com.example.finance.model.data.RawDataDocument;
import com.example.finance.repository.data.RawDataRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

/**
 * 전처리 서비스 (Step 3)
 *
 * C# 원본: uc_Preprocessing.cs
 * - 구분자 기반 키워드 추출 (빠름)
 * - Java Parallel Stream 병렬 처리
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PreprocessingService {

    private final RawDataRepository rawDataRepository;
    private final MongoTemplate mongoTemplate;

    // ⭐ 병렬 처리용 스레드 풀 (CPU 코어 * 4) - 속도 최우선
    private final ExecutorService executorService = Executors.newFixedThreadPool(
            Runtime.getRuntime().availableProcessors() * 4
    );

    private static final int BATCH_SIZE = 20000;

    // 구분자 목록 (C# DataHandler.separator 재현)
    private static final List<String> SEPARATORS = Arrays.asList(
            "-", "_", ".", "/", "\\", "|", ",", ":", ";", " ", "\t"
    );

    // 불용어 목록 (C# DataHandler.remover 재현)
    private static final Set<String> STOPWORDS = new HashSet<>(Arrays.asList(
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
            "은", "는", "이", "가", "을", "를", "의", "에", "와", "과"
    ));

    /**
     * 구분자 기반 키워드 추출 (병렬 처리)
     *
     * C# 원본: keyword_seper_split_Click()
     * - 5단계 파이프라인
     * - PLINQ 병렬 처리
     */
    public void extractKeywordsBySeparator(
            String projectId,
            String sessionId,
            List<String> columns,
            boolean removeOneChar
    ) {
        log.info("Starting keyword extraction: session={}, columns={}", sessionId, columns);

        // 1. raw_data 조회 (세션별)
        List<RawDataDocument> rawDataList = rawDataRepository.findBySessionId(sessionId);
        log.info("Loaded {} raw_data records", rawDataList.size());

        // 2. 병렬 처리 (Java Parallel Stream) ⭐
        List<ProcessViewData> processViewDataList = rawDataList
                .parallelStream() // ⭐ 병렬 처리
                .map(rawData -> extractKeywords(
                        projectId,
                        sessionId,
                        rawData,
                        columns,
                        removeOneChar
                ))
                .collect(Collectors.toList());

        // 3. MongoDB 배치 삽입 (BATCH_SIZE씩)
        insertBatchProcessViewData(processViewDataList);

        log.info("Keywords extracted: {} records", processViewDataList.size());
    }

    /**
     * 단일 행 키워드 추출
     *
     * C# 로직:
     * 1. 구분자 변환
     * 2. 불용어 제거
     * 3. 짧은 문자열 전처리
     * 4. 밑줄 전처리
     * 5. 구분자 기반 분할
     */
    private ProcessViewData extractKeywords(
            String projectId,
            String sessionId,
            RawDataDocument rawData,
            List<String> columns,
            boolean removeOneChar
    ) {
        Map<String, Object> data = rawData.getData();
        Set<String> keywords = new HashSet<>();

        for (String column : columns) {
            Object value = data.get(column);
            if (value == null) continue;

            String text = value.toString().trim();
            if (text.isEmpty()) continue;

            // 1. 구분자를 밑줄로 변환
            for (String sep : SEPARATORS) {
                text = text.replace(sep, "_");
            }

            // 2. 연속된 밑줄 제거
            text = text.replaceAll("_+", "_");
            text = text.replaceAll("^_|_$", ""); // 앞뒤 밑줄 제거

            // 3. 밑줄 기준 분할
            String[] tokens = text.split("_");

            for (String token : tokens) {
                token = token.trim().toLowerCase();

                // 4. 필터링
                if (token.isEmpty()) continue;
                if (removeOneChar && token.length() == 1) continue;
                if (STOPWORDS.contains(token)) continue;

                keywords.add(token);
            }
        }

        // ProcessViewData 생성
        return ProcessViewData.builder()
                .projectId(projectId)
                .sessionId(sessionId)
                .rawDataId(rawData.getId())
                .finalKeywords(new ArrayList<>(keywords))
                .extractionMethod("SEPARATOR")
                .createdAt(LocalDateTime.now())
                .build();
    }

    /**
     * MongoDB 배치 삽입 (병렬 처리)
     */
    private void insertBatchProcessViewData(List<ProcessViewData> dataList) {
        if (dataList.isEmpty()) {
            return;
        }

        // 배치 크기로 분할
        List<List<ProcessViewData>> batches = new ArrayList<>();
        for (int i = 0; i < dataList.size(); i += BATCH_SIZE) {
            int end = Math.min(i + BATCH_SIZE, dataList.size());
            batches.add(dataList.subList(i, end));
        }

        // 병렬 삽입 (CompletableFuture) ⭐
        List<CompletableFuture<Void>> futures = batches.stream()
                .map(batch -> CompletableFuture.runAsync(() -> {
                    mongoTemplate.insertAll(batch);
                    log.info("Inserted batch: {} records", batch.size());
                }, executorService))
                .collect(Collectors.toList());

        // 모든 배치 완료 대기
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        log.info("All batches inserted successfully");
    }

    /**
     * 검증 로직
     */
    public boolean validateColumns(String sessionId, List<String> columns) {
        // TODO: 선택된 컬럼 검증
        // 1. raw_data에서 첫 행 조회
        // 2. 컬럼 존재 여부 확인
        return true;
    }
}