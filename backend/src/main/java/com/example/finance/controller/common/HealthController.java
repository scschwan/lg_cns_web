package com.example.finance.controller.common;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Semaphore;

@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class HealthController {

    private final MongoTemplate mongoTemplate;
    private final Semaphore dbHeavyOperationSemaphore;

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "UP");
        response.put("timestamp", LocalDateTime.now());
        response.put("message", "Finance Tool API is running");
        response.put("version", "1.0.0");
        return response;
    }

    /**
     * DB 상태 헬스체크
     *
     * GET /api/health/db
     *
     * DocumentDB의 실시간 상태를 진단합니다:
     * 1. ping 응답 시간 측정
     * 2. serverStatus에서 현재 커넥션 수 / 가용 커넥션 수 조회
     * 3. Semaphore 잔여 permit 조회 (대량 작업 동시 실행 여부)
     *
     * 응답:
     *   { "dbStatus": "OK|SLOW|OVERLOADED",
     *     "pingMs": 15,
     *     "connections": { "current": 20, "available": 480 },
     *     "semaphoreAvailable": 8,
     *     "message": "..." }
     */
    @GetMapping("/health/db")
    public Map<String, Object> dbHealth() {
        Map<String, Object> response = new HashMap<>();

        // 1. MongoDB ping 응답 시간 측정
        long pingStart = System.currentTimeMillis();
        boolean pingOk = false;
        try {
            Document pingResult = mongoTemplate.getDb()
                    .runCommand(new Document("ping", 1));
            pingOk = pingResult.getDouble("ok") != null && pingResult.getDouble("ok") == 1.0;
        } catch (Exception e) {
            log.warn("DB ping 실패: {}", e.getMessage());
        }
        long pingMs = System.currentTimeMillis() - pingStart;

        // 2. serverStatus에서 커넥션 정보 조회
        int currentConnections = -1;
        int availableConnections = -1;
        try {
            Document serverStatus = mongoTemplate.getDb()
                    .runCommand(new Document("serverStatus", 1));
            Document connections = serverStatus.get("connections", Document.class);
            if (connections != null) {
                currentConnections = connections.getInteger("current", -1);
                availableConnections = connections.getInteger("available", -1);
            }
        } catch (Exception e) {
            // DocumentDB에서 serverStatus가 제한될 수 있음 - 무시
            log.debug("serverStatus 조회 실패 (DocumentDB 제한일 수 있음): {}", e.getMessage());
        }

        // 3. Semaphore 잔여 permit
        int semaphoreAvailable = dbHeavyOperationSemaphore.availablePermits();

        // 4. 상태 판정
        String dbStatus;
        String message;

        if (!pingOk) {
            dbStatus = "OVERLOADED";
            message = "DB 서버가 응답하지 않습니다.";
        } else if (pingMs > 5000) {
            dbStatus = "OVERLOADED";
            message = String.format("DB 응답 시간이 매우 느립니다 (%dms).", pingMs);
        } else if (pingMs > 2000) {
            dbStatus = "SLOW";
            message = String.format("DB 응답이 느려지고 있습니다 (%dms).", pingMs);
        } else if (semaphoreAvailable <= 1) {
            dbStatus = "SLOW";
            message = "대량 DB 작업이 동시에 많이 실행 중입니다.";
        } else {
            dbStatus = "OK";
            message = "DB 서버 상태가 정상입니다.";
        }

        response.put("dbStatus", dbStatus);
        response.put("pingMs", pingMs);
        response.put("pingOk", pingOk);
        response.put("semaphoreAvailable", semaphoreAvailable);
        response.put("message", message);
        response.put("timestamp", LocalDateTime.now());

        if (currentConnections >= 0) {
            Map<String, Integer> connInfo = new HashMap<>();
            connInfo.put("current", currentConnections);
            connInfo.put("available", availableConnections);
            response.put("connections", connInfo);
        }

        return response;
    }

    @GetMapping("/info")
    public Map<String, Object> info() {
        Map<String, Object> response = new HashMap<>();
        response.put("application", "Finance Backend");
        response.put("description", "Financial Data Analysis Tool");
        response.put("springBootVersion", "3.5.9");
        return response;
    }
}
