package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** 과제 요약 통계 응답 DTO (전체 과제 수, 기준금액/절감액 합계 등) */
public class TaskSummaryResponse {

    private Long totalTasks;
    private Double totalBaseAmount;
    private Double totalSavingAmount;
    private Integer avgProgress;
    private Long completedTasks;
    private Double totalActualSaving;
    private Double achievementRate;
}
