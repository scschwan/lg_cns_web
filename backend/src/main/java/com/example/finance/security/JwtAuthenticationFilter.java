package com.example.finance.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * JWT 인증 필터
 *
 * <p>모든 HTTP 요청에 대해 Authorization 헤더에서 JWT 토큰을 추출하고,
 * 유효한 토큰인 경우 Spring Security의 SecurityContext에 인증 정보를 설정한다.</p>
 *
 * <p>OncePerRequestFilter를 상속하여 요청당 한 번만 실행되도록 보장한다.</p>
 *
 * <p>처리 흐름:</p>
 * <ol>
 *   <li>요청 헤더에서 "Bearer {token}" 형식의 JWT 토큰 추출</li>
 *   <li>JwtTokenProvider를 통한 토큰 유효성 검증</li>
 *   <li>토큰에서 UserPrincipal 객체 생성</li>
 *   <li>SecurityContext에 인증 객체 등록</li>
 * </ol>
 *
 * @see JwtTokenProvider 토큰 생성/검증 유틸리티
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        try {
            // 1. 요청에서 JWT 토큰 추출
            String token = getJwtFromRequest(request);

            // 2. 토큰 검증 및 인증 정보 설정
            if (StringUtils.hasText(token) && jwtTokenProvider.validateToken(token)) {
                // ⭐ UserPrincipal 객체 생성
                UserPrincipal userPrincipal = jwtTokenProvider.getUserPrincipalFromToken(token);

                // 3. Spring Security 인증 객체 생성
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                userPrincipal,
                                null,
                                userPrincipal.getAuthorities()
                        );

                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                // 4. SecurityContext에 인증 정보 설정
                SecurityContextHolder.getContext().setAuthentication(authentication);

                log.debug("JWT 인증 성공: userId={}, email={}",
                        userPrincipal.getId(), userPrincipal.getEmail());
            }
        } catch (Exception e) {
            log.error("JWT 인증 필터 오류", e);
        }

        // 5. 다음 필터로 진행
        filterChain.doFilter(request, response);
    }

    /**
     * 요청 헤더에서 JWT 토큰 추출
     *
     * Authorization: Bearer {token}
     */
    private String getJwtFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");

        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }

        return null;
    }
}