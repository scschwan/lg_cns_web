package com.example.finance.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;

/**
 * Redis 연결 및 직렬화 설정 클래스
 *
 * <p>Lettuce 클라이언트를 사용하여 Redis 서버에 연결하고,
 * RedisTemplate의 키/값 직렬화 방식을 설정한다.</p>
 *
 * <ul>
 *   <li>키: StringRedisSerializer (문자열)</li>
 *   <li>값: GenericJackson2JsonRedisSerializer (JSON)</li>
 *   <li>SSL 지원 (프로덕션 환경용)</li>
 *   <li>커맨드 타임아웃: 2초</li>
 * </ul>
 */
@Configuration
public class RedisConfig {

    /** Redis 서버 호스트명 */
    @Value("${spring.data.redis.host}")
    private String redisHost;

    /** Redis 서버 포트 */
    @Value("${spring.data.redis.port}")
    private int redisPort;

    /** SSL 사용 여부 (프로덕션 환경에서 ElastiCache 연결 시 필요) */
    @Value("${spring.data.redis.ssl.enabled}")
    private boolean sslEnabled;

    /**
     * Redis 연결 팩토리 생성
     *
     * <p>Lettuce 클라이언트를 사용하며, SSL 활성화 시 피어 검증을 비활성화한다.
     * 커맨드 타임아웃은 2초로 설정하여 빠른 실패를 유도한다.</p>
     *
     * @return Lettuce 기반 Redis 연결 팩토리
     */
    @Bean
    public RedisConnectionFactory redisConnectionFactory() {
        RedisStandaloneConfiguration config = new RedisStandaloneConfiguration();
        config.setHostName(redisHost);
        config.setPort(redisPort);

        LettuceClientConfiguration.LettuceClientConfigurationBuilder builder =
                LettuceClientConfiguration.builder()
                        .commandTimeout(Duration.ofSeconds(2));

        if (sslEnabled) {
            builder.useSsl().disablePeerVerification();
        }

        return new LettuceConnectionFactory(config, builder.build());
    }

    /**
     * RedisTemplate 빈 생성
     *
     * <p>키는 문자열, 값은 JSON 형식으로 직렬화한다.
     * JavaTimeModule을 등록하여 LocalDateTime 등 Java 8 날짜/시간 타입의
     * JSON 직렬화를 지원한다.</p>
     *
     * @param connectionFactory Redis 연결 팩토리
     * @return 설정이 완료된 RedisTemplate
     */
    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        // Jackson ObjectMapper 설정
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        // Serializer 설정
        GenericJackson2JsonRedisSerializer serializer = new GenericJackson2JsonRedisSerializer(objectMapper);

        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(serializer);
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(serializer);

        template.afterPropertiesSet();
        return template;
    }
}