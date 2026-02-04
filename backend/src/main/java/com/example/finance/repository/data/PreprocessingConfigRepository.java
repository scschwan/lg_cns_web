package com.example.finance.repository.data;

import com.example.finance.model.data.PreprocessingConfigDocument;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface PreprocessingConfigRepository extends MongoRepository<PreprocessingConfigDocument, String> {

    Optional<PreprocessingConfigDocument> findBySessionId(String sessionId);

    void deleteBySessionId(String sessionId);
}
