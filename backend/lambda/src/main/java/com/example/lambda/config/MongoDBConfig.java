package com.example.lambda.config;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;

import java.util.concurrent.TimeUnit;

/**
 * MongoDB 설정
 *
 * Lambda 환경에서는 동시 인스턴스가 많이 생성될 수 있으므로
 * 커넥션 풀을 최소한으로 제한하여 DocumentDB 과부하 방지
 */
public class MongoDBConfig {

    private static MongoClient mongoClient;
    private static MongoDatabase database;

    /**
     * MongoDB 클라이언트 싱글톤
     *
     * ★ 커넥션 풀 제한:
     *   - maxSize=3: Lambda 인스턴스당 최대 3개 커넥션
     *   - minSize=1: 최소 1개 유지
     *   - maxWaitTime=10s: 커넥션 대기 최대 10초
     *   - maxConnectionIdleTime=30s: 유휴 커넥션 30초 후 해제
     *   - maxConnectionLifeTime=5분: 커넥션 최대 수명 5분 (Lambda cold start 고려)
     */
    public static synchronized MongoClient getMongoClient() {
        if (mongoClient == null) {
            String mongoUri = System.getenv("MONGODB_URI");
            if (mongoUri == null || mongoUri.isEmpty()) {
                throw new RuntimeException("MONGODB_URI 환경 변수가 설정되지 않았습니다");
            }

            MongoClientSettings settings = MongoClientSettings.builder()
                    .applyConnectionString(new ConnectionString(mongoUri))
                    .applyToConnectionPoolSettings(builder ->
                            builder.maxSize(3)
                                    .minSize(1)
                                    .maxWaitTime(10, TimeUnit.SECONDS)
                                    .maxConnectionIdleTime(30, TimeUnit.SECONDS)
                                    .maxConnectionLifeTime(5, TimeUnit.MINUTES)
                    )
                    .applyToSocketSettings(builder ->
                            builder.connectTimeout(5, TimeUnit.SECONDS)
                                    .readTimeout(60, TimeUnit.SECONDS)
                    )
                    .retryWrites(false)  // DocumentDB 필수
                    .build();

            mongoClient = MongoClients.create(settings);
        }
        return mongoClient;
    }

    /**
     * MongoDB 데이터베이스
     */
    public static MongoDatabase getDatabase() {
        if (database == null) {
            database = getMongoClient().getDatabase("finance");
        }
        return database;
    }
}