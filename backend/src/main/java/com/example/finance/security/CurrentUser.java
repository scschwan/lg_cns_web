package com.example.finance.security;

import org.springframework.security.core.annotation.AuthenticationPrincipal;

import java.lang.annotation.*;

/**
 * 현재 로그인한 사용자 정보를 컨트롤러 메서드 파라미터로 주입하는 어노테이션
 *
 * 사용 예시:
 * public ResponseEntity<?> someMethod(@CurrentUser UserPrincipal user) {
 *     String userId = user.getId();
 *     String email = user.getEmail();
 *     ...
 * }
 */
@Target({ElementType.PARAMETER, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@AuthenticationPrincipal
public @interface CurrentUser {
}