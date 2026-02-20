package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ItemStatsResponse {

    private Integer rawDataRows;
    private Integer supplierCount;
    private Integer costCenterCount;
    private Double totalAmount;
    private Double ratioToTotal;
}
