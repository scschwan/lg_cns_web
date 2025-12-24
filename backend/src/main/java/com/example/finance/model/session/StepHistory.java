package com.example.finance.model.session;

import com.example.finance.enums.ProcessStep;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;

/**
 * 단계별 이력 (FileSession 내 임베디드)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StepHistory {

    /**
     * 처리 단계
     */
    private ProcessStep step;

    /**
     * 시작 시간
     */
    @Field("started_at")
    private LocalDateTime startedAt;

    /**
     * 완료 시간
     */
    @Field("completed_at")
    private LocalDateTime completedAt;

    /**
     * 소요 시간 (초)
     */
    @Field("duration_seconds")
    private Long durationSeconds;

    /**
     * 상태 (in_progress, completed, failed)
     */
    private String status;

    /**
     * 에러 메시지 (실패 시)
     */
    @Field("error_message")
    private String errorMessage;
}