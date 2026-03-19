package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** 개별 항목 통계 응답 DTO (공급업체/코스트센터 수, 원본 데이터 건수) */
public class ItemStatsResponse {

    private Integer rawDataRows;
    private Integer supplierCount;
    private Integer costCenterCount;
    private Double totalAmount;
    private Double ratioToTotal;
}
