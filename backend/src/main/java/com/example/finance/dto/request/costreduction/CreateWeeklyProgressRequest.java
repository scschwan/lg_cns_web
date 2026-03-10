package com.example.finance.dto.request.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateWeeklyProgressRequest {

    private String weekNumber;
    private String progressDetails;
    private String issues;
    private String author;
}
