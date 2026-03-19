package com.example.finance.config;

import com.example.finance.security.JwtAuthenticationFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.Map;

/**
 * Spring Security 보안 설정 클래스
 *
 * <p>JWT 기반 무상태(Stateless) 인증 체계를 구성하며, CORS 정책,
 * URL별 접근 권한, 인증 실패 시 JSON 응답 처리 등을 담당한다.</p>
 *
 * <ul>
 *   <li>CSRF 비활성화 (REST API 환경)</li>
 *   <li>세션 미사용 (JWT 토큰 기반 인증)</li>
 *   <li>BCrypt 비밀번호 암호화</li>
 *   <li>인증 실패 시 HTML 대신 JSON 401 응답 반환</li>
 * </ul>
 *
 * @see JwtAuthenticationFilter JWT 인증 필터
 */
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    /** JWT 인증 필터 - 모든 요청에서 토큰을 검증하고 SecurityContext에 인증 정보 설정 */
    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    /** JSON 직렬화용 ObjectMapper - 인증 실패 응답 본문 생성에 사용 */
    private final ObjectMapper objectMapper;

    /**
     * 비밀번호 암호화 (BCrypt)
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * CORS(Cross-Origin Resource Sharing) 정책 설정
     *
     * <p>프론트엔드 애플리케이션에서의 API 호출을 허용하기 위해
     * 로컬 개발 환경(localhost:3000)과 프로덕션 도메인을 허용 출처로 등록한다.</p>
     *
     * @return CORS 설정이 적용된 소스 객체
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        // 허용 출처: 로컬 개발, 프로덕션 도메인, CloudFront 배포 URL
        configuration.setAllowedOrigins(Arrays.asList("http://localhost:3000", "https://finance-tool.com" , "https://d3ipfpkjg02npk.cloudfront.net"));
        // 허용 HTTP 메서드
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        // 모든 헤더 허용
        configuration.setAllowedHeaders(Arrays.asList("*"));
        // 인증 정보(쿠키, Authorization 헤더 등) 포함 허용
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    /**
     * Spring Security 필터 체인 설정
     *
     * <p>HTTP 요청에 대한 보안 정책을 정의한다.
     * CSRF 비활성화, 세션 비사용, URL별 접근 권한, JWT 필터 등록 등을 수행한다.</p>
     *
     * @param http HttpSecurity 설정 빌더
     * @return 구성된 SecurityFilterChain
     * @throws Exception 보안 설정 중 발생할 수 있는 예외
     */
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // CSRF 비활성화 (REST API는 CSRF 불필요)
                .csrf(AbstractHttpConfigurer::disable)

                // CORS 설정
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))

                // 세션 비활성화 (JWT 사용)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )

                // 요청 권한 설정
                .authorizeHttpRequests(auth -> auth
                        // /api/auth/me, /api/auth/profile/** 는 인증 필요 (permitAll보다 먼저 선언해야 우선 적용됨)
                        .requestMatchers("/api/auth/me").authenticated()
                        .requestMatchers("/api/auth/profile/**").authenticated()
                        .requestMatchers("/api/auth/profile").authenticated()

                        // 나머지 /api/auth/** 경로는 누구나 접근 가능
                        .requestMatchers("/api/auth/**").permitAll()

                        // /actuator/health, /api/health/** 경로는 누구나 접근 가능 (헬스 체크)
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/api/health/**").permitAll()

                        // 나머지는 인증 필요
                        .anyRequest().authenticated()
                )

                // 인증 실패 시 JSON 401 응답 반환 (HTML index.html 반환 방지)
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(jwtAuthenticationEntryPoint())
                )

                // JWT 인증 필터 추가
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * JWT 인증 실패(만료/미인증) 시 JSON 401 응답을 반환하는 EntryPoint
     */
    @Bean
    public AuthenticationEntryPoint jwtAuthenticationEntryPoint() {
        return (request, response, authException) -> {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");

            Map<String, Object> body = Map.of(
                    "error", "UNAUTHORIZED",
                    "message", "인증이 필요합니다. 토큰이 만료되었거나 유효하지 않습니다.",
                    "status", 401
            );

            response.getWriter().write(objectMapper.writeValueAsString(body));
        };
    }
}