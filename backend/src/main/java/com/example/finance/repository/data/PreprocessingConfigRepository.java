package com.example.finance.repository.data;

import com.example.finance.model.data.PreprocessingConfigDocument;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

/**
 * 전처리 설정 Repository
 *
 * preprocessing_config 컬렉션에 대한 데이터 접근 계층.
 * 세션별 구분자/불용어 설정을 관리한다.
 */
public interface PreprocessingConfigRepository extends MongoRepository<PreprocessingConfigDocument, String> {

    Optional<PreprocessingConfigDocument> findBySessionId(String sessionId);

    void deleteBySessionId(String sessionId);
}
