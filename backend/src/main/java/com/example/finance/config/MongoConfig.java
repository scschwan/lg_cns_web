package com.example.finance.config;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.data.convert.ReadingConverter;
import org.springframework.data.convert.WritingConverter;
import org.springframework.data.mongodb.config.AbstractMongoClientConfiguration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.convert.MongoCustomConversions;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Date;
import java.util.concurrent.TimeUnit;

@Configuration
@EnableMongoRepositories(basePackages = "com.example.finance.repository")
public class MongoConfig extends AbstractMongoClientConfiguration {

    @Value("${spring.data.mongodb.uri}")
    private String mongoUri;

    @Override
    protected String getDatabaseName() {
        return "finance";
    }

    @Override
    public MongoClient mongoClient() {

        ConnectionString connectionString = new ConnectionString(mongoUri);

        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString(connectionString)
                .applyToConnectionPoolSettings(builder ->
                        builder.maxSize(50)
                                .minSize(5)
                                .maxWaitTime(30, TimeUnit.SECONDS)
                                .maxConnectionIdleTime(60, TimeUnit.SECONDS)
                )
                .applyToSocketSettings(builder ->
                        builder.connectTimeout(10, TimeUnit.SECONDS)
                                .readTimeout(120, TimeUnit.SECONDS)
                )
                .retryWrites(false)  // DocumentDB 필수
                .build();

        return MongoClients.create(settings);
    }

    @Bean
    public MongoTemplate mongoTemplate() {
        return new MongoTemplate(mongoClient(), getDatabaseName());
    }

    /**
     * ★ 커스텀 컨버터: LocalDateTime ↔ Date 변환 시 시간대 변환 없이 그대로 저장/읽기
     *
     * 기본 Spring Data MongoDB 컨버터는 LocalDateTime → Date 변환 시 JVM 시간대(KST)를
     * UTC로 변환하여 저장하므로 MongoDB에서 9시간 차이가 발생.
     * 이 커스텀 컨버터는 KST 값을 그대로 MongoDB에 저장하여
     * DB 조회 시에도 한국 시간이 보이도록 함.
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