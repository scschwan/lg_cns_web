package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 차트 데이터 응답 DTO
 *
 * 공급업체별/코스트센터별 집계 데이터를 차트 렌더링용으로 반환한다.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChartDataResponse {

    private List<BreakdownItemDto> supplierBreakdown;
    private List<BreakdownItemDto> costCenterBreakdown;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BreakdownItemDto {
        private String name;
        private Integer count;
        private Double totalAmount;
    }
}
