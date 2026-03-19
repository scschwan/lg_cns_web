package com.example.lambda.config;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

/**
 * Lambda 환경용 Redis(Jedis) 설정 클래스
 *
 * <p>Lambda 인스턴스 간 싱글톤 패턴으로 JedisPool을 공유하며,
 * 업로드 진행 상태, 분석 상태 등을 Redis에 저장/조회하는 데 사용된다.</p>
 *
 * <p>커넥션 풀 설정:</p>
 * <ul>
 *   <li>최대 연결 수: 10</li>
 *   <li>최대 유휴: 5, 최소 유휴: 1</li>
 *   <li>연결 타임아웃: 60초 (Cold Start 대응)</li>
 * </ul>
 */
public class RedisConfig {

    /** Jedis 커넥션 풀 (Lambda 인스턴스 내 싱글톤) */
    private static JedisPool jedisPool;

    /**
     * JedisPool 싱글톤 인스턴스를 반환한다 (lazy 초기화, thread-safe)
     *
     * @return JedisPool 인스턴스
     * @throws RuntimeException REDIS_HOST 환경 변수가 설정되지 않은 경우
     */
    public static synchronized JedisPool getJedisPool() {
        if (jedisPool == null) {
            String redisHost = System.getenv("REDIS_HOST");
            String redisPort = System.getenv("REDIS_PORT");

            if (redisHost == null || redisHost.isEmpty()) {
                throw new RuntimeException("REDIS_HOST 환경 변수가 설정되지 않았습니다");
            }

            int port = redisPort != null ? Integer.parseInt(redisPort) : 6379;

            JedisPoolConfig poolConfig = new JedisPoolConfig();
            poolConfig.setMaxTotal(10);
            poolConfig.setMaxIdle(5);
            poolConfig.setMinIdle(1);

            // ⭐ 타임아웃 60초로 증가 (Cold Start 대응)
            jedisPool = new JedisPool(poolConfig, redisHost, port, 60000);
        }
        return jedisPool;
    }

    /**
     * JedisPool에서 Jedis 인스턴스를 가져온다
     *
     * <p>사용 후 반드시 close()하거나 try-with-resources를 사용해야 한다.</p>
     *
     * @return Jedis 인스턴스 (사용 후 반환 필요)
     */
    public static Jedis getJedis() {
        return getJedisPool().getResource();
    }
}