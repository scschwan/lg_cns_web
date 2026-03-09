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
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "session_data")
@CompoundIndexes({
        @CompoundIndex(name = "session_row_idx", def = "{'session_id': 1, 'row_number': 1}"),
        @CompoundIndex(name = "project_session_idx", def = "{'project_id': 1, 'session_id': 1}"),
        @CompoundIndex(name = "session_upload_idx", def = "{'session_id': 1, 'upload_id': 1}"),
        @CompoundIndex(name = "raw_data_rownum_idx", def = "{'raw_data_id': 1, 'row_number': 1}"),
        @CompoundIndex(name = "session_hidden_idx", def = "{'session_id': 1, 'is_hidden': 1}"),
        @CompoundIndex(name = "stats_l2_rownum_idx", def = "{'stats_l2_id': 1, 'row_number': 1}"),
        @CompoundIndex(name = "stats_l3_rownum_idx", def = "{'stats_l3_id': 1, 'row_number': 1}"),
        @CompoundIndex(name = "session_rawdata_idx", def = "{'session_id': 1, 'raw_data_id': 1}")
})
public class SessionDataDocument {

    @Id
    private String id;

    @Field("project_id")
    private String projectId;

    @Field("session_id")
    private String sessionId;

    @Field("raw_data_id")
    private String rawDataId;

    @Field("upload_id")
    private String uploadId;

    @Field("row_number")
    private Integer rowNumber;

    private Map<String, Object> data;

    @Field("is_hidden")
    @Builder.Default
    private Boolean isHidden = false;

    /**
     * cluster_statistics level 2 (클러스터) 문서 ID
     * 세션 완료(export) 시 설정
     */
    @Field("stats_l2_id")
    private String statsL2Id;

    /**
     * cluster_statistics level 3 (세부클러스터) 문서 ID
     * 세션 완료(export) 시 설정. 세부클러스터 미할당 시 '기타' 항목 ID 저장
     */
    @Field("stats_l3_id")
    private String statsL3Id;

    @Field("created_at")
    private LocalDateTime createdAt;
}
