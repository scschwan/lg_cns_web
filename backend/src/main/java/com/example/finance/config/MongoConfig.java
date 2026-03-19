package com.example.finance.config;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.data.convert.ReadingConverter;
import org.springframework.data.convert.WritingConverter;
import org.springframework.data.mongodb.config.AbstractMongoClientConfiguration;
import org.springframework.data.mongodb.core.convert.MongoCustomConversions;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Date;
import java.util.concurrent.TimeUnit;

/**
 * MongoDB 연결 및 데이터 변환 설정 클래스
 *
 * <p>AWS DocumentDB(MongoDB 호환)에 최적화된 커넥션 풀 설정과
 * LocalDateTime ↔ Date 간 시간대 변환 이슈를 해결하기 위한
 * 커스텀 컨버터를 등록한다.</p>
 *
 * <ul>
 *   <li>커넥션 풀: 최대 30개, 최소 5개 (DocumentDB 과부하 방지)</li>
 *   <li>자동 인덱스 생성 비활성화 (MongoIndexInitializer에서 수동 관리)</li>
 *   <li>retryWrites=false (DocumentDB 필수 설정)</li>
 *   <li>LocalDateTime을 KST 그대로 저장/조회하는 커스텀 컨버터</li>
 * </ul>
 *
 * @see MongoIndexInitializer 인덱스 수동 생성 담당
 */
@Configuration
@EnableMongoRepositories(basePackages = "com.example.finance.repository")
public class MongoConfig extends AbstractMongoClientConfiguration {

    /** MongoDB 연결 URI (환경 변수 또는 application.yml에서 주입) */
    @Value("${spring.data.mongodb.uri}")
    private String mongoUri;

    /**
     * 사용할 MongoDB 데이터베이스 이름 반환
     *
     * @return 데이터베이스명 "finance"
     */
    @Override
    protected String getDatabaseName() {
        return "finance";
    }

    /**
     * 자동 인덱스 생성 비활성화
     *
     * <p>ProjectMember가 projects 컬렉션에 embedded될 때 unique 인덱스 충돌이
     * 발생하므로, MongoIndexInitializer에서 필요한 인덱스만 선택적으로 생성한다.</p>
     *
     * @return false (자동 인덱스 생성 사용 안 함)
     */
    @Override
    protected boolean autoIndexCreation() {
        return false;
    }

    /**
     * MongoDB 클라이언트 생성 및 커넥션 풀 설정
     *
     * <p>DocumentDB 환경에 최적화된 커넥션 풀, 소켓 타임아웃 등을 설정한다.</p>
     *
     * @return 설정이 적용된 MongoClient 인스턴스
     */
    @Override
    public MongoClient mongoClient() {

        ConnectionString connectionString = new ConnectionString(mongoUri);

        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString(connectionString)
                .applyToConnectionPoolSettings(builder ->
                        builder.maxSize(30)                              // 50→30: DocumentDB 과부하 방지
                                .minSize(5)
                                .maxWaitTime(15, TimeUnit.SECONDS)       // 30→15초: 빠른 실패 유도
                                .maxConnectionIdleTime(60, TimeUnit.SECONDS)
                                .maxConnectionLifeTime(10, TimeUnit.MINUTES) // 커넥션 수명 제한
                )
                .applyToSocketSettings(builder ->
                        builder.connectTimeout(10, TimeUnit.SECONDS)
                                .readTimeout(120, TimeUnit.SECONDS)
                )
                .retryWrites(false)  // DocumentDB 필수
                .build();

        return MongoClients.create(settings);
    }

    /**
     * ★ 커스텀 컨버터: LocalDateTime ↔ Date 변환 시 시간대 변환 없이 그대로 저장/읽기
     *
     * 기본 Spring Data MongoDB 컨버터는 LocalDateTime → Date 변환 시 JVM 시간대(KST)를
     * UTC로 변환하여 저장하므로 MongoDB에서 9시간 차이가 발생.
     * 이 커스텀 컨버터는 KST 값을 그대로 MongoDB에 저장하여
     * DB 조회 시에도 한국 시간이 보이도록 함.
     */
    /**
     * LocalDateTime ↔ Date 커스텀 컨버터 등록
     *
     * <p>기본 Spring Data MongoDB 컨버터는 JVM 시간대(KST)를 UTC로 변환하여
     * 저장하므로 9시간 차이가 발생한다. 이 커스텀 컨버터는 시간대 변환 없이
     * KST 값을 그대로 저장/조회한다.</p>
     *
     * @return 커스텀 컨버터가 등록된 MongoCustomConversions
     */
    @Override
    public MongoCustomConversions customConversions() {
        return new MongoCustomConversions(Arrays.asList(
                new LocalDateTimeToDateConverter(),
                new DateToLocalDateTimeConverter()
        ));
    }

    @WritingConverter
    static class LocalDateTimeToDateConverter implements Converter<LocalDateTime, Date> {
        @Override
        public Date convert(LocalDateTime source) {
            // KST LocalDateTime 값을 시간대 변환 없이 그대로 Date로 저장
            return Date.from(source.toInstant(ZoneOffset.UTC));
        }
    }

    @ReadingConverter
    static class DateToLocalDateTimeConverter implements Converter<Date, LocalDateTime> {
        @Override
        public LocalDateTime convert(Date source) {
            // MongoDB의 Date를 시간대 변환 없이 그대로 LocalDateTime으로 읽기
            return LocalDateTime.ofInstant(source.toInstant(), ZoneOffset.UTC);
        }
    }
}