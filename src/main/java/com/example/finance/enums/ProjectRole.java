package com.example.finance.enums;

/**
 * 프로젝트 권한 Enum
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
public enum ProjectRole {
    /**
     * 소유자 (모든 권한)
     */
    OWNER,

    /**
     * 편집자 (업로드, 수정 가능)
     */
    EDITOR,

    /**
     * 뷰어 (읽기만 가능)
     */
    VIEWER
}