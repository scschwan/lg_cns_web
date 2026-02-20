package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

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
