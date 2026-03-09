package com.example.finance.model.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "able_tasks")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AbleTask {

    @Id
    private String id;

    @Indexed
    @Field("project_id")
    private String projectId;

    @Field("task_name")
    private String taskName;

    @Field("major_accounts")
    @Builder.Default
    private List<String> majorAccounts = new ArrayList<>();

    @Field("clusters")
    @Builder.Default
    private List<ClusterRef> clusters = new ArrayList<>();

    @Field("department")
    private String department;

    @Field("manager")
    private String manager;

    @Field("consultant")
    private String consultant;

    @Field("base_amount")
    private Double baseAmount;

    @Field("expected_saving_rate")
    private Double expectedSavingRate;

    @Field("expected_saving_amount")
    private Double expectedSavingAmount;

    @Field("progress")
    @Builder.Default
    private Integer progress = 0;

    @Field("status")
    @Builder.Default
    private String status = "진행 중";

    @Field("actual_saving")
    private Double actualSaving;

    @Field("rating")
    private String rating;

    @Field("progress_details")
    private String progressDetails;

    @Field("issues")
    private String issues;

    @Field("customer_follow_up")
    private String customerFollowUp;

    @Field("action_items")
    private String actionItems;

    @Field("completed_at")
    private LocalDateTime completedAt;

    @Field("created_at")
    private LocalDateTime createdAt;

    @Field("updated_at")
    private LocalDateTime updatedAt;

    @Field("created_by")
    private String createdBy;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClusterRef {
        @Field("statistics_id")
        private String statisticsId;

        @Field("cluster_name")
        private String clusterName;

        @Field("account_name")
        private String accountName;
    }
}
