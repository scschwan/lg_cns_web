package com.example.finance.controller.auth;

import com.example.finance.dto.request.auth.LoginRequest;
import com.example.finance.dto.request.auth.RefreshTokenRequest;
import com.example.finance.dto.request.auth.RegisterRequest;
import com.example.finance.dto.response.auth.LoginResponse;
import com.example.finance.model.auth.User;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.auth.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 인증 컨트롤러
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * 회원가입
     *
     * POST /api/auth/register
     */
    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody RegisterRequest request) {
        log.info("회원가입 요청: email={}", request.getEmail());

        User user = authService.register(request);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "회원가입이 완료되었습니다");
        response.put("userId", user.getId());
        response.put("email", user.getEmail());

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * 로그인
     *
     * POST /api/auth/login
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        log.info("로그인 요청: email={}", request.getEmail());

        LoginResponse response = authService.login(request);

        return ResponseEntity.ok(response);
    }

    /**
     * 현재 사용자 정보 조회 (세션 유효성 검증)
     *
     * GET /api/auth/me
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser(@CurrentUser UserPrincipal userPrincipal) {
        // UserPrincipal이 null인 경우 (토큰이 없거나 유효하지 않은 경우)
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        log.info("현재 사용자 조회: userId={}", userPrincipal.getId());

        Map<String, Object> response = authService.getCurrentUserInfo(userPrincipal.getId());

        return ResponseEntity.ok(response);
    }

    /**
     * 토큰 갱신
     *
     * POST /api/auth/refresh
     */
    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refreshToken(@Valid @RequestBody RefreshTokenRequest request) {
        log.info("토큰 갱신 요청");

        LoginResponse response = authService.refreshToken(request.getRefreshToken());

        return ResponseEntity.ok(response);
    }

    /**
     * 헬스 체크
     *
     * GET /api/auth/health
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        Map<String, String> response = new HashMap<>();
        response.put("status", "UP");
        response.put("service", "auth");
        return ResponseEntity.ok(response);
    }
}
