package com.example.finance.dto.request.project;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 프로젝트 생성 요청 DTO
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateProjectRequest {

    @NotBlank(message = "프로젝트 이름은 필수입니다")
    private String name;

    private String description;

    /**
     * 프로젝트 유형: STANDARD(일반) / DASHBOARD(대시보드 전용)
     */
    private String projectType;
}