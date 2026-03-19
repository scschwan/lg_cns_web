package com.example.finance.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;

/**
 * JWT 토큰 생성 및 검증 유틸리티 클래스
 *
 * <p>HMAC-SHA 알고리즘을 사용하여 Access Token과 Refresh Token을 생성하고,
 * 토큰에서 사용자 정보(ID, 이메일)를 추출하며, 토큰의 유효성을 검증한다.</p>
 *
 * <ul>
 *   <li>Access Token: 사용자 인증에 사용 (기본 1시간 만료)</li>
 *   <li>Refresh Token: Access Token 갱신에 사용 (기본 7일 만료)</li>
 * </ul>
 *
 * @see JwtAuthenticationFilter 토큰 검증 필터
 * @see UserPrincipal 토큰에서 추출한 사용자 정보 객체
 */
@Slf4j
@Component
public class JwtTokenProvider {

    /** JWT 서명에 사용할 비밀 키 (환경 변수로 주입, 프로덕션에서 반드시 변경 필요) */
    @Value("${jwt.secret}")
    private String secret;

    /** Access Token 만료 시간 (밀리초, 기본 3,600,000ms = 1시간) */
    @Value("${jwt.access-token-expiration}")
    private long accessTokenExpiration;

    /** Refresh Token 만료 시간 (밀리초, 기본 604,800,000ms = 7일) */
    @Value("${jwt.refresh-token-expiration}")
    private long refreshTokenExpiration;

    /**
     * HMAC-SHA 서명에 사용할 비밀 키를 생성한다
     *
     * @return HMAC-SHA용 SecretKey 인스턴스
     */
    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes());
    }

    /**
     * Access Token을 생성한다
     *
     * <p>토큰에 사용자 ID(subject), 이메일, 토큰 타입("access")을 포함한다.</p>
     *
     * @param userId 사용자 ID (MongoDB ObjectId)
     * @param email  사용자 이메일
     * @return 서명된 JWT Access Token 문자열
     */
    public String createAccessToken(String userId, String email) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + accessTokenExpiration);

        return Jwts.builder()
                .subject(userId)
                .claim("email", email)
                .claim("type", "access")
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(getSigningKey())
                .compact();
    }

    /**
     * Refresh Token을 생성한다
     *
     * <p>Access Token 갱신 시 사용되며, 사용자 ID와 토큰 타입("refresh")만 포함한다.</p>
     *
     * @param userId 사용자 ID (MongoDB ObjectId)
     * @return 서명된 JWT Refresh Token 문자열
     */
    public String createRefreshToken(String userId) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + refreshTokenExpiration);

        return Jwts.builder()
                .subject(userId)
                .claim("type", "refresh")
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(getSigningKey())
                .compact();
    }

    /**
     * JWT 토큰에서 사용자 ID를 추출한다
     *
     * @param token JWT 토큰 문자열
     * @return 사용자 ID (토큰의 subject 클레임)
     */
    public String getUserIdFromToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();

        return claims.getSubject();
    }

    /**
     * JWT 토큰에서 이메일을 추출한다
     *
     * @param token JWT 토큰 문자열
     * @return 사용자 이메일 (토큰의 "email" 클레임)
     */
    public String getEmailFromToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();

        return claims.get("email", String.class);
    }

    /**
     * JWT 토큰에서 UserPrincipal 객체를 생성한다
     *
     * <p>토큰의 subject(사용자 ID)와 email 클레임을 추출하여
     * Spring Security 인증에 사용할 UserPrincipal 객체를 구성한다.</p>
     *
     * @param token JWT 토큰 문자열
     * @return 사용자 정보가 담긴 UserPrincipal 객체
     */
    public UserPrincipal getUserPrincipalFromToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();

        String userId = claims.getSubject();
        String email = claims.get("email", String.class);

        UserPrincipal userPrincipal = new UserPrincipal();
        userPrincipal.setId(userId);
        userPrincipal.setEmail(email);
        userPrincipal.setUsername(email); // username은 email과 동일

        return userPrincipal;
    }

    /**
     * JWT 토큰의 유효성을 검증한다
     *
     * <p>서명 검증, 만료 시간 확인 등을 수행하며,
     * 검증 실패 시 false를 반환하고 에러 로그를 남긴다.</p>
     *
     * @param token 검증할 JWT 토큰 문자열
     * @return 유효한 토큰이면 true, 아니면 false
     */
    public boolean validateToken(String token) {
        try {
            Jwts.parser()
                    .verifyWith(getSigningKey())
                    .build()
                    .parseSignedClaims(token);
            return true;
        } catch (Exception e) {
            log.error("JWT 토큰 검증 실패: {}", e.getMessage());
            return false;
        }
    }
}
