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

    /**
     * 프로젝트 ID
     */
    private String projectId;

    /**
     * 프로젝트명
     */
    private String name;

    /**
     * 프로젝트 설명
     */
    private String description;

    /**
     * 내 권한
     */
    private ProjectRole role;

    /**
     * 총 세션 수
     */
    private int totalSessions;

    /**
     * 완료된 세션 수
     */
    private int completedSessions;

    /**
     * 멤버 수
     */
    private int memberCount;

    /**
     * 생성 시간 ⭐ 신규 추가
     */
    private LocalDateTime createdAt;

    /**
     * 마지막 접근 시간
     */
    private LocalDateTime lastAccessedAt;
}