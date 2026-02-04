package com.example.finance.model.data;

import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 전처리 설정 (세션별 구분자/불용어 목록)
 */
@Document(collection = "preprocessing_config")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PreprocessingConfigDocument {

    @Id
    private String id;

    @Indexed(unique = true)
    @Field("session_id")
    private String sessionId;

    /**
     * 구분자 목록 (각 항목에 checked 여부 포함)
     */
    @Field("separators")
    private List<ConfigItem> separators;

    /**
     * 불용어 목록 (각 항목에 checked 여부 포함)
     */
    @Field("stopwords")
    private List<ConfigItem> stopwords;

    @Field("created_at")
    private LocalDateTime createdAt;

    @Field("updated_at")
    private LocalDateTime updatedAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ConfigItem {
        private String value;
        private Boolean checked;
    }
}
