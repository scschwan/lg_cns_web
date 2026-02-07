package com.example.finance;

import jakarta.annotation.PostConstruct;
import org.apache.poi.util.IOUtils;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.TimeZone;

@SpringBootApplication
public class FinanceBackendApplication {

    public static void main(String[] args) {
        // ★ JVM 기본 시간대를 한국 시간(KST, UTC+09:00)으로 설정
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Seoul"));
        SpringApplication.run(FinanceBackendApplication.class, args);
    }

    @PostConstruct
    public void init() {
        // POI 대용량 파일 처리를 위해 배열 최대 크기 상향 (300MB)
        IOUtils.setByteArrayMaxOverride(300_000_000);

        // ★ @PostConstruct에서도 한국 시간대 보장
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Seoul"));
    }

}
