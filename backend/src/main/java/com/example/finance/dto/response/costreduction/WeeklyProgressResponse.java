package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WeeklyProgressResponse {

    private String id;
    private String taskId;
    private String weekNumber;
    private String progressDetails;
    private String issues;
    private String author;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
