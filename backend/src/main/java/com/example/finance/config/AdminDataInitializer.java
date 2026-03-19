package com.example.finance.config;

import com.example.finance.model.auth.User;
import com.example.finance.repository.auth.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 관리자 계정 초기 데이터 생성기
 *
 * <p>애플리케이션 시작 시 기본 관리자(admin) 계정이 존재하지 않으면
 * 자동으로 생성한다. ApplicationRunner를 구현하여 스프링 컨텍스트
 * 초기화 완료 후 실행된다.</p>
 *
 * <p>기본 관리자 계정: admin / admin (프로덕션 배포 전 비밀번호 변경 필수)</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AdminDataInitializer implements ApplicationRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * 애플리케이션 시작 시 관리자 계정 존재 여부를 확인하고, 없으면 생성한다
     *
     * @param args 애플리케이션 실행 인자 (사용하지 않음)
     */
    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.findByEmail("admin").isEmpty()) {
            User admin = User.builder()
                    .email("admin")
                    .password(passwordEncoder.encode("admin"))
                    .name("관리자")
                    .role("ADMIN")
                    .isApproved(true)
                    .isActive(true)
                    .createdAt(LocalDateTime.now())
                    .build();
            userRepository.save(admin);
            log.info("Admin 계정 생성 완료: admin/admin");
        }
    }
}
