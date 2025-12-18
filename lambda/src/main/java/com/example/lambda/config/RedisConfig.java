package com.example.lambda.config;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

/**
 * Redis 설정
 */
public class RedisConfig {

    private static JedisPool jedisPool;

    /**
     * Jedis Pool 싱글톤
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

            jedisPool = new JedisPool(poolConfig, redisHost, port , 30000 );
        }
        return jedisPool;
    }

    /**
     * Jedis 인스턴스 가져오기
     */
    public static Jedis getJedis() {
        return getJedisPool().getResource();
    }
}