package com.example.finance.controller;

import com.example.finance.model.RawDataDocument;
import com.example.finance.repository.RawDataRepository;
import com.example.finance.service.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/data")
@RequiredArgsConstructor
public class DataController {

    private final RawDataRepository rawDataRepository;
    private final RedisService redisService;

    /**
     * MongoDB 연결 테스트 - 데이터 삽입
     */
    @PostMapping("/test")
    public RawDataDocument testInsert(@RequestBody(required = false) Map<String, Object> requestData) {
        log.info("Testing MongoDB insert...");

        RawDataDocument doc = RawDataDocument.builder()
                .sessionId("test-session-" + System.currentTimeMillis())
                .uploadId("test-upload-" + System.currentTimeMillis())
                .rowNumber(1)
                .data(requestData != null ? requestData : createTestData())
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        RawDataDocument saved = rawDataRepository.save(doc);
        log.info("Document saved: {}", saved.getId());

        return saved;
    }

    /**
     * MongoDB 조회 테스트 - 전체 개수
     */
    @GetMapping("/count")
    public Map<String, Object> getCount() {
        long totalCount = rawDataRepository.count();

        Map<String, Object> response = new HashMap<>();
        response.put("totalCount", totalCount);
        response.put("timestamp", LocalDateTime.now());

        log.info("Total document count: {}", totalCount);
        return response;
    }

    /**
     * sessionId로 조회
     */
    @GetMapping("/session/{sessionId}")
    public Map<String, Object> getBySessionId(
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        // 캐시 확인
        String cacheKey = String.format("session:%s:page:%d:size:%d", sessionId, page, size);
        Object cached = redisService.get(cacheKey);

        if (cached != null) {
            log.debug("Cache HIT: {}", cacheKey);
            return (Map<String, Object>) cached;
        }

        // 캐시 미스 - MongoDB 조회
        log.debug("Cache MISS: {}", cacheKey);
        Pageable pageable = PageRequest.of(page, size, Sort.by("rowNumber").ascending());
        Page<RawDataDocument> result = rawDataRepository.findBySessionId(sessionId, pageable);

        Map<String, Object> response = new HashMap<>();
        response.put("data", result.getContent());
        response.put("currentPage", result.getNumber());
        response.put("totalPages", result.getTotalPages());
        response.put("totalElements", result.getTotalElements());
        response.put("size", result.getSize());

        // 캐시 저장 (TTL 30분)
        redisService.set(cacheKey, response, Duration.ofMinutes(30));

        return response;
    }

    /**
     * 전체 데이터 조회 (페이징)
     */
    @GetMapping
    public Map<String, Object> getAllData(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        Page<RawDataDocument> result = rawDataRepository.findAll(pageable);

        Map<String, Object> response = new HashMap<>();
        response.put("data", result.getContent());
        response.put("currentPage", result.getNumber());
        response.put("totalPages", result.getTotalPages());
        response.put("totalElements", result.getTotalElements());

        return response;
    }

    /**
     * 테스트 데이터 생성 헬퍼
     */
    private Map<String, Object> createTestData() {
        Map<String, Object> data = new HashMap<>();
        data.put("날짜", "2025-01-15");
        data.put("금액", 1500000);
        data.put("거래처", "테스트 주식회사");
        data.put("카테고리", "매출");
        data.put("비고", "MongoDB 연결 테스트");
        return data;
    }
}