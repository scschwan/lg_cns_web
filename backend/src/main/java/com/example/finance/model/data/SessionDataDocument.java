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

/**
 * 세션 데이터 문서
 *
 * MongoDB 컬렉션: session_data
 *
 * raw_data에서 복사되어 세션별로 관리되는 데이터이다.
 * 행 숨김(is_hidden) 처리, 표준화, 컬럼 매핑 등
 * Step 2(File Load) 이후 데이터 가공에 활용된다.
 * 세션 완료 시 cluster_statistics와 연결하기 위한 statsL2Id, statsL3Id 필드를 포함한다.
 */
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

    /** 프로젝트 ID */
    @Field("project_id")
    private String projectId;

    /** 세션 ID */
    @Field("session_id")
    private String sessionId;

    /** 원본 raw_data 문서 ID 참조 */
    @Field("raw_data_id")
    private String rawDataId;

    /** 업로드 ID (파일 식별자) */
    @Field("upload_id")
    private String uploadId;

    /** 행 번호 */
    @Field("row_number")
    private Integer rowNumber;

    /** 데이터 (가변 필드 - Excel 컬럼 매핑) */
    private Map<String, Object> data;

    /** 행 숨김 여부 (데이터 삭제 대신 숨김 처리) */
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

    /** 생성 시간 */
    @Field("created_at")
    private LocalDateTime createdAt;
}
