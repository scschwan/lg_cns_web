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

@Document(collection = "cost_reduction_dashboards")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CostReductionDashboard {

    @Id
    private String id;

    @Indexed(unique = true)
    @Field("project_id")
    private String projectId;

    @Field("current_phase")
    @Builder.Default
    private String currentPhase = "LONG_LIST";

    @Field("is_list_locked")
    @Builder.Default
    private Boolean isListLocked = false;

    @Field("editor_user_id")
    private String editorUserId;

    @Field("editor_user_name")
    private String editorUserName;

    @Field("editor_acquired_at")
    private LocalDateTime editorAcquiredAt;

    @Field("editor_heartbeat_at")
    private LocalDateTime editorHeartbeatAt;

    @Field("created_at")
    private LocalDateTime createdAt;

    @Field("updated_at")
    private LocalDateTime updatedAt;
}
