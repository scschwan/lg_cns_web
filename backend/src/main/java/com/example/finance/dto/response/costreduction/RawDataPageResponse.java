package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** 원본 데이터 페이징 응답 DTO */
public class RawDataPageResponse {

    /**
     * 컬럼 헤더 목록 (동적 필드명)
     */
    private List<String> columns;

    /**
     * 데이터 행 목록
     */
    private List<Map<String, Object>> rows;

    /**
     * 현재 페이지 (0-based)
     */
    private int page;

    /**
     * 페이지 크기
     */
    private int size;

    /**
     * 전체 데이터 건수
     */
    private long totalCount;

    /**
     * 전체 페이지 수
     */
    private int totalPages;
}
