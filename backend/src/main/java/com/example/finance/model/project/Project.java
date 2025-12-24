package com.example.finance.model.project;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

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
@CompoundIndex(name = "created_by_created_at_idx", def = "{'created_by': 1, 'created_at': -1}")
@CompoundIndex(name = "members_user_id_idx", def = "{'members.user_id': 1}")
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
    @Field("project_name")
    private String projectName;

    /**
     * 프로젝트 설명
     */
    private String description;

    /**
     * 생성자 ID (User._id)
     */
    @Indexed
    @Field("created_by")
    private String createdBy;

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

    // ⭐⭐⭐ 신규 추가 필드 ⭐⭐⭐

    /**
     * 프로젝트 멤버 목록 (임베디드)
     */
    @Builder.Default
    private List<ProjectMember> members = new ArrayList<>();

    /**
     * 총 세션 수 (캐싱용)
     */
    @Field("total_sessions")
    @Builder.Default
    private Integer totalSessions = 0;

    /**
     * 완료된 세션 수 (캐싱용)
     */
    @Field("completed_sessions")
    @Builder.Default
    private Integer completedSessions = 0;

    /**
     * 총 파일 수 (캐싱용)
     */
    @Field("total_files")
    @Builder.Default
    private Integer totalFiles = 0;

    /**
     * 삭제 여부
     */
    @Indexed
    @Field("is_deleted")
    @Builder.Default
    private Boolean isDeleted = false;

    /**
     * 삭제 시간
     */
    @Field("deleted_at")
    private LocalDateTime deletedAt;

    /**
     * 삭제한 사용자 ID
     */
    @Field("deleted_by")
    private String deletedBy;
}