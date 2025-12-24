package com.example.finance.model.auth;

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
 * 사용자 모델
 *
 * MongoDB 컬렉션: users
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Document(collection = "users")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    private String id;

    /**
     * 이메일 (로그인 ID)
     * Unique Index 설정
     */
    @Indexed(unique = true)
    private String email;

    /**
     * 비밀번호 (BCrypt 암호화)
     */
    private String password;

    /**
     * 사용자 이름
     */
    private String name;

    /**
     * 계정 생성 시간
     */
    @Field("created_at")
    private LocalDateTime createdAt;

    /**
     * 마지막 로그인 시간
     */
    @Field("last_login_at")
    private LocalDateTime lastLoginAt;

    /**
     * 계정 활성화 여부
     */
    @Field("is_active")
    @Builder.Default
    private Boolean isActive = true;
}