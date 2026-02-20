package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LongListStatsResponse {

    private Long rawDataRows;
    private Integer accountCount;
    private Integer mainClusterCount;
    private Integer subClusterCount;
    private Double totalAmount;
}
