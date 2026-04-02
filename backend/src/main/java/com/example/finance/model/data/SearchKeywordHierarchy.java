package com.example.finance.model.data;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;

/**
 * 검색 키워드 계층 구조 (Lv1/Lv2/Lv3)
 *
 * 사용자가 자주 사용하는 키워드를 계층 구조로 관리
 * Lv1 > Lv2 > Lv3 형태의 트리 구조
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "search_keyword_hierarchy")
@CompoundIndexes({
        @CompoundIndex(name = "session_level_idx", def = "{'session_id': 1, 'level': 1}"),
        @CompoundIndex(name = "session_parent_idx", def = "{'session_id': 1, 'parent_id': 1}"),
        @CompoundIndex(name = "project_level_idx", def = "{'project_id': 1, 'level': 1}"),
        @CompoundIndex(name = "project_parent_idx", def = "{'project_id': 1, 'parent_id': 1}")
})
public class SearchKeywordHierarchy {

    @Id
    private String id;

    @Field("session_id")
    private String sessionId;

    @Field("project_id")
    private String projectId;

    @Field("level")
    private Integer level; // 1, 2, 3

    @Field("parent_id")
    private String parentId; // null for Lv1, parent's id for Lv2/Lv3

    @Field("keyword")
    private String keyword;

    @Field("display_order")
    @Builder.Default
    private Integer displayOrder = 0;

    @Field("created_at")
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
