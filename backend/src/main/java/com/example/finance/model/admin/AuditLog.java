package com.example.finance.model.admin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;

/**
 * 감사 로그 모델
 *
 * MongoDB 컬렉션: audit_logs
 *
 * 관리자/사용자의 시스템 조작 이력을 기록한다.
 * 사용자 승인/삭제, 프로젝트 멤버 변경, 세션 초기화 등의 작업을 추적한다.
 */
@Document(collection = "audit_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLog {

    @Id
    private String id;

    /** 관리자 ID (관리자 작업 시) */
    @Indexed
    @Field("admin_id")
    private String adminId;

    /** 사용자 ID (사용자 활동 로그 시) */
    @Indexed
    @Field("user_id")
    private String userId;

    /** 사용자 이름 */
    @Field("user_name")
    private String userName;

    /** 수행된 작업 (APPROVE_USER, DELETE_USER, CHANGE_ROLE 등) */
    @Field("action")
    private String action;

    /** 대상 유형 (USER, PROJECT, SESSION 등) */
    @Indexed
    @Field("target_type")
    private String targetType;

    /** 대상 ID */
    @Indexed
    @Field("target_id")
    private String targetId;

    /** 상세 설명 */
    @Field("detail")
    private String detail;

    /** 생성 시간 */
    @Field("created_at")
    private LocalDateTime createdAt;
}
