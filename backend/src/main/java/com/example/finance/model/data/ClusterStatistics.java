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
 * 클러스터 통계 (세션 완료 시 생성)
 *
 * MongoDB 컬렉션: cluster_statistics
 *
 * 계층 구조:
 *   level 1: 세션 전체 통계 (계정명 기준)
 *   level 2: 병합 클러스터 / 독립 클러스터 통계
 *   level 3: 세부 클러스터 통계 (parentClusterNumber로 상위 참조)
 */
@Document(collection = "cluster_statistics")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@CompoundIndex(name = "session_level_idx", def = "{'session_id': 1, 'level': 1}")
@CompoundIndex(name = "session_cluster_idx", def = "{'session_id': 1, 'cluster_number': 1}")
@CompoundIndex(name = "project_level_idx", def = "{'project_id': 1, 'level': 1}")
public class ClusterStatistics {

    @Id
    private String id;

    @Indexed
    @Field("project_id")
    private String projectId;

    @Indexed
    @Field("session_id")
    private String sessionId;

    /**
     * 클러스터 번호 (level 1은 null)
     */
    @Field("cluster_number")
    private Integer clusterNumber;

    /**
     * 상위 클러스터 번호 (level 3에서 사용, level 1/2는 null)
     */
    @Field("parent_cluster_number")
    private Integer parentClusterNumber;

    /**
     * 클러스터명 (level 1은 null)
     */
    @Field("cluster_name")
    private String clusterName;

    /**
     * 계정명
     */
    @Field("account_name")
    private String accountName;

    /**
     * 계층 레벨:
     *   1 = 세션 전체 (계정명 기준)
     *   2 = 병합/독립 클러스터
     *   3 = 세부 클러스터
     */
    @Field("level")
    private Integer level;

    /**
     * 총 데이터 건수
     */
    @Field("total_count")
    @Builder.Default
    private Integer totalCount = 0;

    /**
     * 총 금액
     */
    @Field("total_amount")
    @Builder.Default
    private Double totalAmount = 0.0;

    /**
     * 코스트센터 수
     */
    @Field("cost_center_count")
    @Builder.Default
    private Integer costCenterCount = 0;

    /**
     * 공급업체 수
     */
    @Field("supplier_count")
    @Builder.Default
    private Integer supplierCount = 0;

    /**
     * 코스트센터별 집계
     */
    @Field("cost_center_breakdown")
    @Builder.Default
    private List<BreakdownItem> costCenterBreakdown = new ArrayList<>();

    /**
     * 공급업체별 집계
     */
    @Field("supplier_breakdown")
    @Builder.Default
    private List<BreakdownItem> supplierBreakdown = new ArrayList<>();

    /**
     * 생성 시간
     */
    @Field("created_at")
    private LocalDateTime createdAt;

    /**
     * 집계 항목 (코스트센터/공급업체별)
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BreakdownItem {
        private String name;
        private Integer count;
        private Double totalAmount;
    }
}
