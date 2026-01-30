package com.example.finance.dto.response.project;

import lombok.Builder;
import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
public class ProjectDetailResponse {
    private String projectId;
    private String projectName;
    private String description;
    private List<ProjectMemberResponse> members; // 상세 멤버 리스트
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}