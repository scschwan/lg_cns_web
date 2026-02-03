package com.example.finance;

import jakarta.annotation.PostConstruct;
import org.apache.poi.util.IOUtils;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class FinanceBackendApplication {

    public static void main(String[] args) {

        SpringApplication.run(FinanceBackendApplication.class, args);
    }

    @PostConstruct
    public void init() {
        // POI 대용량 파일 처리를 위해 배열 최대 크기 상향 (300MB)
        IOUtils.setByteArrayMaxOverride(300_000_000);
    }

}
