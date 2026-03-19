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

/**
 * 원가절감 대시보드 모델
 *
 * MongoDB 컬렉션: cost_reduction_dashboards
 *
 * 프로젝트별 대시보드 상태를 관리한다.
 * 현재 페이즈(LONG_LIST/SHORT_LIST/TASK), 리스트 잠금 여부,
 * 편집자 정보 등을 포함한다.
 */
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
