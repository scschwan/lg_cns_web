package com.example.finance.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.Semaphore;

/**
 * DB 동시 접속 제어 설정
 *
 * DocumentDB CPU 과부하를 방지하기 위해 동시에 실행 가능한
 * 대량 DB 작업 수를 제한하는 Semaphore를 제공합니다.
 *
 * ★ 사용 예시:
 *   @Autowired Semaphore dbHeavyOperationSemaphore;
 *
 *   if (!dbHeavyOperationSemaphore.tryAcquire(10, TimeUnit.SECONDS)) {
 *       throw new ServiceUnavailableException("DB 서버가 과부하 상태입니다.");
 *   }
 *   try {
 *       // 대량 DB 작업 실행
 *   } finally {
 *       dbHeavyOperationSemaphore.release();
 *   }
 */
@Slf4j
@Configuration
public class DbThrottleConfig {

    /**
     * 대량 DB 작업 동시 실행 제한 Semaphore
     *
     * - permits=10: 동시에 최대 10개의 대량 DB 작업만 허용
     * - 대량 작업 예시: bulk insert, 대용량 aggregation, session_data 복사 등
     * - fair=true: 대기 순서를 보장 (FIFO)
     */
    @Bean
    public Semaphore dbHeavyOperationSemaphore() {
        int maxConcurrent = 10;
        log.info("★ DB 대량 작업 동시 실행 제한: maxConcurrent={}", maxConcurrent);
        return new Semaphore(maxConcurrent, true);
    }
}
