package com.example.finance.service.common;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Redis 서비스
 *
 * Redis 캐시 및 세션 관리를 위한 공통 유틸리티 서비스.
 * String/Hash/Set 연산, 세션 저장/조회, 업로드 진행률 관리,
 * 패턴 기반 키 삭제 등의 기능을 제공한다.
 */
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

    // ===== Atomic Operations =====

    /**
     * SET NX - 키가 없을 때만 설정 (편집자 잠금용)
     */
    public Boolean setIfAbsent(String key, Object value, Duration ttl) {
        return redisTemplate.opsForValue().setIfAbsent(key, value, ttl);
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

    // ===== 세션 완료 진행률 추적 (Redis 기반) =====

    private static final String COMPLETE_PROGRESS_PREFIX = "complete:progress:";
    private static final String COMPLETE_LOCK_PREFIX = "complete:lock:";

    /**
     * 세션 완료 진행률 저장
     */
    public void saveCompleteProgress(String taskId, String status, int progress,
                                       String message, String sessionId) {
        String key = COMPLETE_PROGRESS_PREFIX + taskId;
        hSet(key, "status", status);
        hSet(key, "progress", String.valueOf(progress));
        hSet(key, "message", message);
        hSet(key, "sessionId", sessionId);
        hSet(key, "updatedAt", String.valueOf(System.currentTimeMillis()));
        expire(key, Duration.ofHours(1));
    }

    /**
     * 세션 완료 결과 저장 (완료/실패 시)
     */
    public void saveCompleteResult(String taskId, String status, int progress,
                                     String message, String resultJson) {
        String key = COMPLETE_PROGRESS_PREFIX + taskId;
        hSet(key, "status", status);
        hSet(key, "progress", String.valueOf(progress));
        hSet(key, "message", message);
        if (resultJson != null) {
            hSet(key, "result", resultJson);
        }
        hSet(key, "completedAt", String.valueOf(System.currentTimeMillis()));
        expire(key, Duration.ofHours(1));
    }

    /**
     * 세션 완료 진행률 조회
     */
    public Map<Object, Object> getCompleteProgress(String taskId) {
        String key = COMPLETE_PROGRESS_PREFIX + taskId;
        return hGetAll(key);
    }

    /**
     * 세션 완료 잠금 (중복 실행 방지, 10분 TTL)
     * @return true if lock acquired, false if already locked
     */
    public Boolean lockSessionComplete(String sessionId, String taskId) {
        String key = COMPLETE_LOCK_PREFIX + sessionId;
        return setIfAbsent(key, taskId, Duration.ofMinutes(10));
    }

    /**
     * 세션 완료 잠금 해제
     */
    public void unlockSessionComplete(String sessionId) {
        delete(COMPLETE_LOCK_PREFIX + sessionId);
    }

    /**
     * 현재 세션의 완료 taskId 조회
     */
    public Object getSessionCompleteTaskId(String sessionId) {
        return get(COMPLETE_LOCK_PREFIX + sessionId);
    }
}