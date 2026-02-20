package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShortListStatsResponse {

    private Integer longListItemCount;
    private Integer shortListItemCount;
    private Double totalAmount;
    private Double shortListTotalAmount;
    private Double selectionRatio;
}
