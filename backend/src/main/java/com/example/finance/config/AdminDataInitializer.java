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

@Slf4j
@Component
@RequiredArgsConstructor
public class AdminDataInitializer implements ApplicationRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

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
