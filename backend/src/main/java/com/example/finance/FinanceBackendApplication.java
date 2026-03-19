package com.example.finance;

import jakarta.annotation.PostConstruct;
import org.apache.poi.util.IOUtils;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.TimeZone;

/**
 * Finance Backend 메인 애플리케이션 클래스
 *
 * <p>Spring Boot 애플리케이션의 진입점으로, JVM 시간대를 한국 시간(KST)으로 설정하고
 * Apache POI 대용량 파일 처리를 위한 초기화를 수행한다.</p>
 *
 * <p>주요 초기화 항목:</p>
 * <ul>
 *   <li>JVM 기본 시간대: Asia/Seoul (UTC+09:00)</li>
 *   <li>POI 바이트 배열 최대 크기: 300MB (대용량 Excel 처리 지원)</li>
 * </ul>
 */
@SpringBootApplication
public class FinanceBackendApplication {

    /**
     * 애플리케이션 메인 메서드
     *
     * @param args 커맨드 라인 인자
     */
    public static void main(String[] args) {
        // JVM 기본 시간대를 한국 시간(KST, UTC+09:00)으로 설정
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Seoul"));
        SpringApplication.run(FinanceBackendApplication.class, args);
    }

    /**
     * 스프링 컨텍스트 초기화 후 추가 설정 수행
     *
     * <p>POI 라이브러리의 바이트 배열 제한을 300MB로 상향하여
     * 대용량 Excel 파일 처리 시 OutOfMemoryError를 방지한다.</p>
     */
    @PostConstruct
    public void init() {
        // POI 대용량 파일 처리를 위해 배열 최대 크기 상향 (300MB)
        IOUtils.setByteArrayMaxOverride(300_000_000);

        // @PostConstruct에서도 한국 시간대 보장 (Spring 내부에서 시간대가 변경될 수 있음)
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Seoul"));
    }

}
