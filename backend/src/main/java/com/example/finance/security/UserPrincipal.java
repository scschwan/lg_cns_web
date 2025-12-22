package com.example.finance.security;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.Collections;

/**
 * Spring Security UserDetails 구현체
 * JWT 토큰에서 추출한 사용자 정보를 담는 클래스
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserPrincipal implements UserDetails {

    private String id;          // MongoDB ObjectId (String)
    private String email;       // 사용자 이메일
    private String username;    // 사용자 이름
    private String password;    // 비밀번호 (JWT에서는 사용 안 함)

    /**
     * 권한 목록 반환
     * 현재는 기본 USER 권한만 사용
     */
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"));
    }

    /**
     * 비밀번호 반환 (JWT 인증에서는 사용 안 함)
     */
    @Override
    public String getPassword() {
        return this.password;
    }

    /**
     * 사용자명 반환 (이메일 사용)
     */
    @Override
    public String getUsername() {
        return this.email;
    }

    /**
     * 계정 만료 여부 (항상 true)
     */
    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    /**
     * 계정 잠김 여부 (항상 true)
     */
    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    /**
     * 비밀번호 만료 여부 (항상 true)
     */
    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    /**
     * 계정 활성화 여부 (항상 true)
     */
    @Override
    public boolean isEnabled() {
        return true;
    }

    /**
     * ID 반환 (Authentication.getName()으로 접근 가능)
     */
    @Override
    public String toString() {
        return this.id;
    }
}