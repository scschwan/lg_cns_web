package com.example.finance.dto.response.project;

import com.example.finance.enums.ProjectRole;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class ProjectMemberResponse {
    private String userId;
    private String email;      // 추가됨
    private String name;       // 추가됨
    private String department; // 추가됨 (User 모델에 있다면)
    private ProjectRole role;
    private LocalDateTime joinedAt;
}