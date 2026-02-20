package com.example.finance.dto.request.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

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
