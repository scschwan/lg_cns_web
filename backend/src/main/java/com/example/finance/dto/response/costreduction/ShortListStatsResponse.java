package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** Short List 전체 통계 응답 DTO */
public class ShortListStatsResponse {

    private Integer longListItemCount;
    private Integer shortListItemCount;
    private Double totalAmount;
    private Double shortListTotalAmount;
    private Double selectionRatio;

    // Raw 데이터 통계 (전처리 결과 = Long List 도출 페이지 전체 데이터)
    private Integer rawAccountCount;
    private Integer rawClusterCount;
    private Integer rawSubClusterCount;
    private Double rawTotalAmount;

    // Long List 도출 결과 (계정명/클러스터/세부클러스터)
    private Integer longListAccountCount;
    private Integer longListClusterCount;
    private Integer longListSubClusterCount;

    // Short List 도출 결과
    private Integer shortListAccountCount;
    private Integer shortListClusterCount;
    private Integer shortListSubClusterCount;

    // Able 과제 등록 단계 (Short List) 건수
    private Integer ableRegisterAccountCount;
    private Integer ableRegisterClusterCount;
    private Double ableRegisterTotalAmount;
}
