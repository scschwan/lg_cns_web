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

@Document(collection = "long_short_lists")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LongShortList {

    @Id
    private String id;

    @Indexed(unique = true)
    @Field("project_id")
    private String projectId;

    @Field("long_list_items")
    @Builder.Default
    private List<ListItem> longListItems = new ArrayList<>();

    @Field("short_list_items")
    @Builder.Default
    private List<ListItem> shortListItems = new ArrayList<>();

    @Field("is_locked")
    @Builder.Default
    private Boolean isLocked = false;

    @Field("locked_at")
    private LocalDateTime lockedAt;

    @Field("locked_by")
    private String lockedBy;

    @Field("created_at")
    private LocalDateTime createdAt;

    @Field("updated_at")
    private LocalDateTime updatedAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ListItem {

        @Field("statistics_id")
        private String statisticsId;

        @Field("session_id")
        private String sessionId;

        @Field("account_name")
        private String accountName;

        @Field("cluster_number")
        private Integer clusterNumber;

        @Field("cluster_name")
        private String clusterName;

        @Field("level")
        private Integer level;

        @Field("parent_cluster_number")
        private Integer parentClusterNumber;

        @Field("total_amount")
        private Double totalAmount;

        @Field("total_count")
        private Integer totalCount;
    }
}
