package com.example.finance.model.data;

import com.example.finance.model.data.PreprocessingConfigDocument.ConfigItem;
import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 사용자 레벨 전처리 설정 (구분자/불용어 기본값)
 *
 * 새 세션 생성 시 사용자가 저장한 기본 설정을 자동으로 적용한다.
 * 사용자별 1건만 존재하며, 세션 독립적으로 관리된다.
 */
@Document(collection = "user_preprocessing_config")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserPreprocessingConfigDocument {

    @Id
    private String id;

    @Indexed(unique = true)
    @Field("user_id")
    private String userId;

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
}
