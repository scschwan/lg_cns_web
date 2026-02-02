package com.example.finance.service.auth;

import com.example.finance.dto.request.auth.LoginRequest;
import com.example.finance.dto.request.auth.RegisterRequest;
import com.example.finance.dto.response.auth.LoginResponse;
import com.example.finance.exception.DuplicateEmailException;
import com.example.finance.exception.InvalidCredentialsException;
import com.example.finance.exception.UserNotFoundException;
import com.example.finance.model.auth.User;
import com.example.finance.repository.auth.UserRepository;
import com.example.finance.security.JwtTokenProvider;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 인증 서비스
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    /**
     * 회원가입
     */
    @Transactional
    public User register(@Valid RegisterRequest request) {
        log.info("회원가입 시도: email={}", request.getEmail());

        if (userRepository.existsByEmail(request.getEmail())) {
            throw new DuplicateEmailException("이미 사용 중인 이메일입니다: " + request.getEmail());
        }

        String encodedPassword = passwordEncoder.encode(request.getPassword());

        User user = User.builder()
                .email(request.getEmail())
                .password(encodedPassword)
                .name(request.getName())
                .createdAt(LocalDateTime.now())
                .isActive(true)
                .build();

        user = userRepository.save(user);

        log.info("회원가입 완료: userId={}, email={}", user.getId(), user.getEmail());

        return user;
    }

    /**
     * 로그인
     */
    @Transactional
    public LoginResponse login(@Valid LoginRequest request) {
        log.info("로그인 시도: email={}", request.getEmail());

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new UserNotFoundException("사용자를 찾을 수 없습니다: " + request.getEmail()));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new InvalidCredentialsException("비밀번호가 일치하지 않습니다");
        }

        if (!user.getIsActive()) {
            throw new InvalidCredentialsException("비활성화된 계정입니다");
        }

        String accessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getEmail());
        String refreshToken = jwtTokenProvider.createRefreshToken(user.getId());

        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        log.info("로그인 완료: userId={}, email={}", user.getId(), user.getEmail());

        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .userId(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .build();
    }

    /**
     * 현재 사용자 정보 조회
     *
     * @param userId JWT에서 추출한 사용자 ID
     * @return 사용자 정보 Map
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getCurrentUserInfo(String userId) {
        log.info("사용자 정보 조회: userId={}", userId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("사용자를 찾을 수 없습니다: " + userId));

        if (!user.getIsActive()) {
            throw new InvalidCredentialsException("비활성화된 계정입니다");
        }

        Map<String, Object> userInfo = new HashMap<>();
        userInfo.put("userId", user.getId());
        userInfo.put("email", user.getEmail());
        userInfo.put("name", user.getName());

        return userInfo;
    }

    /**
     * Refresh Token으로 새 Access Token 발급
     *
     * @param refreshToken 클라이언트에서 전달한 refresh token
     * @return 새로운 토큰이 포함된 LoginResponse
     */
    @Transactional
    public LoginResponse refreshToken(String refreshToken) {
        log.info("토큰 갱신 시도");

        // 1. Refresh Token 유효성 검증
        if (!jwtTokenProvider.validateToken(refreshToken)) {
            throw new InvalidCredentialsException("유효하지 않거나 만료된 Refresh Token입니다");
        }

        // 2. Refresh Token에서 사용자 ID 추출
        String userId = jwtTokenProvider.getUserIdFromToken(refreshToken);

        // 3. 사용자 조회 및 활성 상태 확인
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("사용자를 찾을 수 없습니다: " + userId));

        if (!user.getIsActive()) {
            throw new InvalidCredentialsException("비활성화된 계정입니다");
        }

        // 4. 새 토큰 발급
        String newAccessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getEmail());
        String newRefreshToken = jwtTokenProvider.createRefreshToken(user.getId());

        log.info("토큰 갱신 완료: userId={}", user.getId());

        return LoginResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .userId(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .build();
    }
}
