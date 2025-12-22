package com.example.lambda.config;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;

/**
 * MongoDB 설정
 */
public class MongoDBConfig {

    private static MongoClient mongoClient;
    private static MongoDatabase database;

    /**
     * MongoDB 클라이언트 싱글톤
     */
    public static synchronized MongoClient getMongoClient() {
        if (mongoClient == null) {
            String mongoUri = System.getenv("MONGODB_URI");
            if (mongoUri == null || mongoUri.isEmpty()) {
                throw new RuntimeException("MONGODB_URI 환경 변수가 설정되지 않았습니다");
            }

            MongoClientSettings settings = MongoClientSettings.builder()
                    .applyConnectionString(new ConnectionString(mongoUri))
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