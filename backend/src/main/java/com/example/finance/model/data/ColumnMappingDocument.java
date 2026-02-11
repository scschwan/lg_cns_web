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

/**
 * 컬럼 매핑 정보 (세션별 컬럼 가시성/순서/타입 관리)
 *
 * MongoDB 컬렉션: column_mapping
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "column_mapping")
@CompoundIndexes({
        @CompoundIndex(name = "session_seq_idx", def = "{'session_id': 1, 'sequence': 1}"),
        @CompoundIndex(name = "session_name_idx", def = "{'session_id': 1, 'original_name': 1}", unique = true),
        @CompoundIndex(name = "session_visible_seq_idx", def = "{'session_id': 1, 'is_visible': 1, 'sequence': 1}")
})
public class ColumnMappingDocument {

    @Id
    private String id;

    @Field("session_id")
    private String sessionId;

    @Field("original_name")
    private String originalName;

    @Field("display_name")
    private String displayName;

    @Field("data_type")
    @Builder.Default
    private String dataType = "text";

    @Field("is_visible")
    @Builder.Default
    private Boolean isVisible = true;

    @Field("sequence")
    private Integer sequence;
}
