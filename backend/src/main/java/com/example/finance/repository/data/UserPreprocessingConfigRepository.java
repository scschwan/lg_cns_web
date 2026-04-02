package com.example.finance.repository.data;

import com.example.finance.model.data.UserPreprocessingConfigDocument;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

/**
 * 사용자 레벨 전처리 설정 Repository
 *
 * user_preprocessing_config 컬렉션에 대한 데이터 접근 계층.
 * 사용자별 구분자/불용어 기본 설정을 관리한다.
 */
public interface UserPreprocessingConfigRepository extends MongoRepository<UserPreprocessingConfigDocument, String> {

    Optional<UserPreprocessingConfigDocument> findByUserId(String userId);

    void deleteByUserId(String userId);
}
