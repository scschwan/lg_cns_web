package com.example.finance.model.project;

import com.example.finance.enums.ProjectRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 프로젝트 멤버 모델
 *
 * MongoDB 컬렉션: project_members
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Document(collection = "project_members")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@CompoundIndex(name = "project_user_idx", def = "{'project_id': 1, 'user_id': 1}", unique = true)
public class ProjectMember {

    @Id
    private String id;

    /**
     * 프로젝트 ID
     */
    @Field("project_id")
    private String projectId;

    /**
     * 사용자 ID
     */
    @Field("user_id")
    private String userId;

    /**
     * 역할
     */
    private ProjectRole role;

    /**
     * 초대한 사용자 ID
     */
    @Field("invited_by")
    private String invitedBy;

    /**
     * 가입 시간
     */
    @Field("joined_at")
    private LocalDateTime joinedAt;

    /**
     * 권한 설정
     */
    private Map<String, Boolean> permissions;
}