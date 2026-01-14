package com.example.finance.model.data;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 전처리 키워드 데이터
 *
 * MongoDB 컬렉션: process_view_data
 *
 * Step 3 (Preprocessing)에서 생성
 */
@Document(collection = "process_view_data")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@CompoundIndex(name = "session_raw_idx", def = "{'session_id': 1, 'raw_data_id': 1}")
public class ProcessViewData {

    @Id
    private String id;

    /**
     * 세션 ID
     */
    @Indexed
    @Field("session_id")
    private String sessionId;

    /**
     * 프로젝트 ID
     */
    @Indexed
    @Field("project_id")
    private String projectId;

    /**
     * 원본 raw_data._id
     */
    @Indexed
    @Field("raw_data_id")
    private String rawDataId;

    /**
     * 추출된 최종 키워드 목록
     *
     * C# 원본: process_view_data.final_keywords
     */
    @Field("final_keywords")
    @Builder.Default
    private List<String> finalKeywords = new ArrayList<>();

    /**
     * 키워드 추출 방식
     * - SEPARATOR: 구분자 기반
     * - NLP: NLP 기반
     */
    @Field("extraction_method")
    private String extractionMethod;

    /**
     * 생성 시간
     */
    @Field("created_at")
    private LocalDateTime createdAt;

    /**
     * 수정 시간
     */
    @Field("updated_at")
    private LocalDateTime updatedAt;
}