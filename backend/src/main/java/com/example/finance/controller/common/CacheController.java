package com.example.finance.controller;

import com.example.finance.service.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/cache")
@RequiredArgsConstructor
public class CacheController {

    private final RedisService redisService;

    /**
     * Redis 연결 테스트 - 데이터 저장
     */
    @PostMapping("/test")
    public Map<String, Object> testSet(
            @RequestParam String key,
            @RequestParam String value
    ) {
        log.info("Testing Redis set: key={}, value={}", key, value);

        redisService.set(key, value);

        Map<String, Object> response = new HashMap<>();
        response.put("status", "success");
        response.put("key", key);
        response.put("value", value);
        response.put("timestamp", LocalDateTime.now());

        return response;
    }

    /**
     * Redis 조회 테스트
     */
    @GetMapping("/test/{key}")
    public Map<String, Object> testGet(@PathVariable String key) {
        log.info("Testing Redis get: key={}", key);

        Object value = redisService.get(key);

        Map<String, Object> response = new HashMap<>();
        response.put("key", key);
        response.put("value", value);
        response.put("exists", value != null);
        response.put("timestamp", LocalDateTime.now());

        return response;
    }

    /**
     * 세션 저장 테스트
     */
    @PostMapping("/session")
    public Map<String, Object> testSession(@RequestParam String sessionId) {
        Map<String, Object> sessionData = new HashMap<>();
        sessionData.put("userId", "user-" + System.currentTimeMillis());
        sessionData.put("loginTime", LocalDateTime.now());
        sessionData.put("role", "ADMIN");

        redisService.saveSession(sessionId, sessionData);

        Map<String, Object> response = new HashMap<>();
        response.put("status", "success");
        response.put("sessionId", sessionId);
        response.put("sessionData", sessionData);
        response.put("ttl", "2 hours");

        return response;
    }

    /**
     * 세션 조회 테스트
     */
    @GetMapping("/session/{sessionId}")
    public Map<String, Object> getSession(@PathVariable String sessionId) {
        Object sessionData = redisService.getSession(sessionId);

        Map<String, Object> response = new HashMap<>();
        response.put("sessionId", sessionId);
        response.put("sessionData", sessionData);
        response.put("exists", sessionData != null);

        return response;
    }

    /**
     * 업로드 진행률 저장 테스트
     */
    @PostMapping("/upload/progress")
    public Map<String, Object> saveProgress(
            @RequestParam String uploadId,
            @RequestParam int progress
    ) {
        redisService.saveUploadProgress(uploadId, progress);

        Map<String, Object> response = new HashMap<>();
        response.put("status", "success");
        response.put("uploadId", uploadId);
        response.put("progress", progress);

        return response;
    }

    /**
     * 업로드 진행률 조회 테스트
     */
    @GetMapping("/upload/progress/{uploadId}")
    public Map<Object, Object> getProgress(@PathVariable String uploadId) {
        return redisService.getUploadProgress(uploadId);
    }
}
