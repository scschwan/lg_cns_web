package com.example.finance.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 처리된 데이터 Document
 *
 * MongoDB 컬렉션: process_data
 *
 * Phase 2에서 사용
 */
@Document(collection = "process_data")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@CompoundIndex(name = "project_session_idx", def = "{'project_id': 1, 'session_id': 1}")
public class ProcessDataDocument {

    @Id
    private String id;

    /**
     * 프로젝트 ID
     */
    @Field("project_id")
    private String projectId;

    /**
     * 세션 ID
     */
    @Field("session_id")
    private String sessionId;

    /**
     * 원본 데이터 ID (raw_data 참조)
     */
    @Field("raw_data_id")
    private String rawDataId;

    /**
     * 처리된 데이터
     */
    private Map<String, Object> data;

    /**
     * 클러스터 ID (Phase 2 Step 5에서 추가)
     */
    @Field("cluster_id")
    private Integer clusterId;

    /**
     * 클러스터 이름 (Phase 2 Step 5에서 추가)
     */
    @Field("cluster_name")
    private String clusterName;

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