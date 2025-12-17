package com.example.finance.dto.response;

import com.example.finance.enums.ProjectRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 프로젝트 요약 응답 DTO
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectSummary {

    private String projectId;
    private String name;
    private ProjectRole role;
    private int memberCount;
    private LocalDateTime lastAccessedAt;
}