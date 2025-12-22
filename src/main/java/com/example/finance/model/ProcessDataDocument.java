package com.example.finance.model;

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
import java.util.Map;

/**
 * 처리된 데이터 문서
 *
 * MongoDB 컬렉션: process_data
 */
@Document(collection = "process_data")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@CompoundIndex(name = "project_session_idx", def = "{'project_id': 1, 'session_id': 1}")
@CompoundIndex(name = "session_cluster_idx", def = "{'session_id': 1, 'cluster_id': 1}")
@CompoundIndex(name = "project_hidden_idx", def = "{'project_id': 1, 'is_hidden': 1}")
public class ProcessDataDocument {

    @Id
    private String id;

    // ⭐ 신규 추가
    /**
     * 프로젝트 ID
     */
    @Indexed
    @Field("project_id")
    private String projectId;

    /**
     * 세션 ID
     */
    @Indexed
    @Field("session_id")
    private String sessionId;

    /**
     * Raw 데이터 ID 참조
     */
    @Field("raw_data_id")
    private String rawDataId;

    /**
     * 처리된 데이터 (가변 필드)
     */
    private Map<String, Object> data;

    // ⭐ 클러스터링 결과 (Step 5 이후)

    /**
     * 클러스터 ID
     */
    @Field("cluster_id")
    private Integer clusterId;

    /**
     * 클러스터명
     */
    @Field("cluster_name")
    private String clusterName;

    /**
     * 숨김 처리 여부
     */
    @Field("is_hidden")
    @Builder.Default
    private Boolean isHidden = false;

    /**
     * 생성 시간
     */
    @Field("created_at")
    private LocalDateTime createdAt;
}