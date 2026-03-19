package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 과제 응답 DTO
 *
 * 원가절감 과제의 상세 정보를 반환한다.
 */
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
    private String progressDetails;
    private String issues;
    private String customerFollowUp;
    private String actionItems;
    private LocalDateTime completedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Integer documentCount;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClusterRefDto {
        private String statisticsId;
        private String clusterName;
        private String accountName;
        private Integer level;
        private String parentClusterName;
    }
}
