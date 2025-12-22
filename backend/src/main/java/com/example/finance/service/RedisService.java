package com.example.finance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class RedisService {

    private final RedisTemplate<String, Object> redisTemplate;

    // ===== String Operations =====

    public void set(String key, Object value) {
        redisTemplate.opsForValue().set(key, value);
    }

    public void set(String key, Object value, Duration ttl) {
        redisTemplate.opsForValue().set(key, value, ttl);
    }

    public Object get(String key) {
        return redisTemplate.opsForValue().get(key);
    }

    public Boolean delete(String key) {
        return redisTemplate.delete(key);
    }

    public Long delete(Set<String> keys) {
        return redisTemplate.delete(keys);
    }

    public Boolean hasKey(String key) {
        return redisTemplate.hasKey(key);
    }

    public Boolean expire(String key, Duration ttl) {
        return redisTemplate.expire(key, ttl);
    }

    // ===== Hash Operations =====

    public void hSet(String key, String hashKey, Object value) {
        redisTemplate.opsForHash().put(key, hashKey, value);
    }

    public Object hGet(String key, String hashKey) {
        return redisTemplate.opsForHash().get(key, hashKey);
    }

    public Map<Object, Object> hGetAll(String key) {
        return redisTemplate.opsForHash().entries(key);
    }

    public Boolean hHasKey(String key, String hashKey) {
        return redisTemplate.opsForHash().hasKey(key, hashKey);
    }

    public Long hDelete(String key, Object... hashKeys) {
        return redisTemplate.opsForHash().delete(key, hashKeys);
    }

    // ===== Increment Operations =====

    public Long increment(String key) {
        return redisTemplate.opsForValue().increment(key);
    }

    public Long increment(String key, long delta) {
        return redisTemplate.opsForValue().increment(key, delta);
    }

    public Long hIncrement(String key, String hashKey, long delta) {
        return redisTemplate.opsForHash().increment(key, hashKey, delta);
    }

    // ===== TTL Operations =====

    public Long getExpire(String key) {
        return redisTemplate.getExpire(key, TimeUnit.SECONDS);
    }

    // ===== Utility Methods =====

    public Set<String> keys(String pattern) {
        return redisTemplate.keys(pattern);
    }

    /**
     * 세션 저장 (TTL 2시간)
     */
    public void saveSession(String sessionId, Object sessionData) {
        String key = "session:" + sessionId;
        set(key, sessionData, Duration.ofHours(2));
        log.debug("Session saved: {}", sessionId);
    }

    /**
     * 세션 조회
     */
    public Object getSession(String sessionId) {
        String key = "session:" + sessionId;
        return get(key);
    }

    /**
     * 업로드 진행률 저장
     */
    public void saveUploadProgress(String uploadId, int progress) {
        String key = "upload:progress:" + uploadId;
        hSet(key, "progress", progress);
        hSet(key, "updatedAt", System.currentTimeMillis());
        expire(key, Duration.ofHours(24));
        log.debug("Upload progress saved: {} - {}%", uploadId, progress);
    }

    /**
     * 업로드 진행률 조회
     */
    public Map<Object, Object> getUploadProgress(String uploadId) {
        String key = "upload:progress:" + uploadId;
        return hGetAll(key);
    }

    /**
     * 페이징 캐시 저장 (TTL 30분)
     */
    public void cachePageData(String sessionId, int page, Object data) {
        String key = String.format("session:%s:page:%d", sessionId, page);
        set(key, data, Duration.ofMinutes(30));
        log.debug("Page cached: session={}, page={}", sessionId, page);
    }

    /**
     * 페이징 캐시 조회
     */
    public Object getCachedPageData(String sessionId, int page) {
        String key = String.format("session:%s:page:%d", sessionId, page);
        return get(key);
    }

    /**
     * 세션별 캐시 전체 삭제
     */
    public void invalidateSessionCache(String sessionId) {
        String pattern = "session:" + sessionId + ":*";
        Set<String> keys = keys(pattern);
        if (keys != null && !keys.isEmpty()) {
            Long deleted = delete(keys);
            log.debug("Session cache invalidated: {} ({} keys deleted)", sessionId, deleted);
        }
    }
}