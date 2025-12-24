package com.example.finance.service.auth;

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
     *
     * @param request 회원가입 요청
     * @return 생성된 사용자
     */
    @Transactional
    public User register(com.example.finance.dto.request.auth.@Valid RegisterRequest request) {
        log.info("회원가입 시도: email={}", request.getEmail());

        // 1. 이메일 중복 확인
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new DuplicateEmailException("이미 사용 중인 이메일입니다: " + request.getEmail());
        }

        // 2. 비밀번호 암호화
        String encodedPassword = passwordEncoder.encode(request.getPassword());

        // 3. 사용자 생성
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
     *
     * @param request 로그인 요청
     * @return 로그인 응답 (JWT 토큰 포함)
     */
    @Transactional
    public LoginResponse login(com.example.finance.dto.request.auth.@Valid LoginRequest request) {
        log.info("로그인 시도: email={}", request.getEmail());

        // 1. 사용자 조회
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new UserNotFoundException("사용자를 찾을 수 없습니다: " + request.getEmail()));

        // 2. 비밀번호 검증
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new InvalidCredentialsException("비밀번호가 일치하지 않습니다");
        }

        // 3. 계정 활성화 확인
        if (!user.getIsActive()) {
            throw new InvalidCredentialsException("비활성화된 계정입니다");
        }

        // 4. JWT 토큰 생성
        String accessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getEmail());
        String refreshToken = jwtTokenProvider.createRefreshToken(user.getId());

        // 5. 마지막 로그인 시간 업데이트
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        log.info("로그인 완료: userId={}, email={}", user.getId(), user.getEmail());

        // 6. 응답 생성
        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .userId(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .build();
    }
}