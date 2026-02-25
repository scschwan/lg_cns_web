package com.example.finance.model.admin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;

/**
 * 시스템 유지보수 상태 모델
 *
 * MongoDB 컬렉션: system_maintenance
 * 단일 문서로 관리 (id = "singleton")
 */
@Document(collection = "system_maintenance")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MaintenanceStatus {

    @Id
    private String id;

    /**
     * 유지보수 모드 활성화 여부
     */
    @Field("is_maintenance")
    @Builder.Default
    private Boolean isMaintenance = false;

    /**
     * 유지보수 모드 활성화 이유 (선택적)
     */
    @Field("reason")
    private String reason;

    /**
     * 유지보수 모드 활성화 시작 시간
     */
    @Field("started_at")
    private LocalDateTime startedAt;

    /**
     * 유지보수 모드 비활성화 시간
     */
    @Field("ended_at")
    private LocalDateTime endedAt;

    /**
     * 마지막 상태 변경 관리자 ID
     */
    @Field("updated_by")
    private String updatedBy;

    /**
     * 마지막 상태 변경 시간
     */
    @Field("updated_at")
    private LocalDateTime updatedAt;

    /**
     * Lambda worker 작업 중 여부 (자동 관리)
     */
    @Field("is_lambda_running")
    @Builder.Default
    private Boolean isLambdaRunning = false;

    /**
     * 현재 Lambda 작업 uploadId
     */
    @Field("current_upload_id")
    private String currentUploadId;

    /**
     * Lambda 작업 진행률 (0~100)
     */
    @Field("lambda_progress")
    @Builder.Default
    private Integer lambdaProgress = 0;

    /**
     * Lambda 작업 시작 시간
     */
    @Field("lambda_started_at")
    private LocalDateTime lambdaStartedAt;

    /**
     * Lambda 작업 완료 시간
     */
    @Field("lambda_completed_at")
    private LocalDateTime lambdaCompletedAt;
}
