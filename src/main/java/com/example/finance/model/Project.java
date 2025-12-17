package com.example.finance.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 프로젝트 모델
 *
 * MongoDB 컬렉션: projects
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Document(collection = "projects")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Project {

    @Id
    private String id;

    /**
     * 프로젝트 ID (UUID)
     */
    @Indexed(unique = true)
    @Field("project_id")
    private String projectId;

    /**
     * 프로젝트 이름
     */
    private String name;

    /**
     * 프로젝트 설명
     */
    private String description;

    /**
     * 소유자 ID
     */
    @Field("owner_id")
    private String ownerId;

    /**
     * 생성 시간
     */
    @Field("created_at")
    private LocalDateTime createdAt;

    /**
     * 마지막 수정 시간
     */
    @Field("updated_at")
    private LocalDateTime updatedAt;

    /**
     * 활성화 여부
     */
    @Field("is_active")
    @Builder.Default
    private Boolean isActive = true;

    /**
     * 프로젝트 설정 (JSON 형태)
     */
    private Map<String, Object> settings;
}