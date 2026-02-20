package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskSummaryResponse {

    private Long totalTasks;
    private Double totalBaseAmount;
    private Double totalSavingAmount;
    private Integer avgProgress;
    private Long completedTasks;
    private Double totalActualSaving;
    private Double achievementRate;
}
