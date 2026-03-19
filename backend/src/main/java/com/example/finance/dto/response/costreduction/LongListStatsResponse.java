package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** Long List 전체 통계 응답 DTO */
public class LongListStatsResponse {

    private Long rawDataRows;
    private Integer accountCount;
    private Integer mainClusterCount;
    private Integer subClusterCount;
    private Double totalAmount;
}
