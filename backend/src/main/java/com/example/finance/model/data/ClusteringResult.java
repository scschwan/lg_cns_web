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
import java.util.List;

/**
 * 클러스터링 결과
 *
 * MongoDB 컬렉션: clustering_results
 */
@Document(collection = "clustering_results")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@CompoundIndex(name = "project_session_idx", def = "{'project_id': 1, 'session_id': 1}")
@CompoundIndex(name = "session_cluster_idx", def = "{'session_id': 1, 'cluster_id': 1}")
public class ClusteringResult {

    @Id
    private String id;

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
     * 클러스터 중심점 (K-Means)
     */
    @Field("cluster_center")
    private List<Double> clusterCenter;

    /**
     * 레코드 수
     */
    @Field("record_count")
    private Long recordCount;

    /**
     * 합산 금액
     */
    @Field("total_amount")
    private Long totalAmount;

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