package com.example.finance.dto.request.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 원가절감 과제 생성 요청 DTO
 *
 * 과제명, 대계정 목록, 연결 클러스터, 담당 부서/매니저/컨설턴트,
 * 기준금액, 예상 절감률/금액 정보를 포함한다.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateTaskRequest {

    private String taskName;
    private List<String> majorAccounts;
    private List<ClusterRefDto> clusters;
    private String department;
    private String manager;
    private String consultant;
    private Double baseAmount;
    private Double expectedSavingRate;
    private Double expectedSavingAmount;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClusterRefDto {
        private String statisticsId;
        private String clusterName;
        private String accountName;
    }
}
