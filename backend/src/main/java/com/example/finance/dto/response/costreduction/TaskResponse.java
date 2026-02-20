package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskResponse {

    private String id;
    private String projectId;
    private String taskName;
    private List<String> majorAccounts;
    private List<ClusterRefDto> clusters;
    private String department;
    private String manager;
    private String consultant;
    private Double baseAmount;
    private Double expectedSavingRate;
    private Double expectedSavingAmount;
    private Integer progress;
    private String status;
    private Double actualSaving;
    private String rating;
    private LocalDateTime completedAt;
    private LocalDateTime createdAt;
    private Integer documentCount;

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
