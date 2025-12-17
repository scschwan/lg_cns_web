package com.example.finance.repository;

import com.example.finance.model.User;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 사용자 Repository
 *
 * Phase 0: 인증 및 프로젝트 관리
 */
@Repository
public interface UserRepository extends MongoRepository<User, String> {

    /**
     * 이메일로 사용자 조회
     *
     * @param email 사용자 이메일
     * @return 사용자 Optional
     */
    Optional<User> findByEmail(String email);

    /**
     * 이메일 존재 여부 확인
     *
     * @param email 사용자 이메일
     * @return 존재 여부
     */
    boolean existsByEmail(String email);
}