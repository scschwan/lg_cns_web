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

    /** 세션 ID */
    @Field("session_id")
    private String sessionId;

    /** 원본 컬럼명 (Excel 헤더에서 추출) */
    @Field("original_name")
    private String originalName;

    /** 화면 표시용 컬럼명 */
    @Field("display_name")
    private String displayName;

    /** 데이터 타입 (text, number 등) */
    @Field("data_type")
    @Builder.Default
    private String dataType = "text";

    /** 컬럼 가시성 여부 */
    @Field("is_visible")
    @Builder.Default
    private Boolean isVisible = true;

    /** 컬럼 표시 순서 */
    @Field("sequence")
    private Integer sequence;
}
