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

    // 세분화 건수 (계정명/클러스터/세부클러스터)
    private Integer longListAccountCount;
    private Integer longListClusterCount;
    private Integer longListSubClusterCount;
    private Integer shortListAccountCount;
    private Integer shortListClusterCount;
    private Integer shortListSubClusterCount;
}
