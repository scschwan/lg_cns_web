package com.example.finance.dto.request.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateTaskRequest {

    private String taskName;
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
}
