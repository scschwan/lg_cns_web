package com.example.finance.dto.request.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 주간 진척 생성/수정 요청 DTO
 */
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
