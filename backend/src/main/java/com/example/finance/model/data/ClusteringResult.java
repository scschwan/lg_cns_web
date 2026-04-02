package com.example.finance.model.data;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 클러스터링 결과 (Step 5)
 *
 * MongoDB 컬렉션: clustering_results
 *
 * cluster_number: 세션 내 고유 번호 (자동 증가)
 * cluster_id: -1 = 미병합, >0 = 소속된 병합 클러스터의 cluster_number
 * cluster_sub_id: -1 = 세부병합 없음, >0 = 소속된 세부병합 클러스터의 cluster_number (Step 7)
 */
@Document(collection = "clustering_results")
@Data
@Builder
@AllArgsConstructor
@CompoundIndex(name = "session_cluster_num_idx", def = "{'session_id': 1, 'cluster_number': 1}", unique = true)
@CompoundIndex(name = "session_cluster_id_idx", def = "{'session_id': 1, 'cluster_id': 1}")
public class ClusteringResult {

    /**
     * ★ @Builder.Default는 builder에서만 기본값이 적용되고,
     * @NoArgsConstructor로 생성된 인스턴스에는 적용되지 않아 null이 됨.
     * Spring Data MongoDB는 no-arg constructor를 사용하므로 수동 초기화 필수.
     */
    public ClusteringResult() {
        this.clusterId = -1;
        this.clusterSubId = -1;
        this.keywords = new ArrayList<>();
        this.count = 0;
        this.totalAmount = 0.0;
        this.dataIndices = new ArrayList<>();
        this.customName = null;
    }

    @Id
    private String id;

    @Indexed
    @Field("session_id")
    private String sessionId;

    /**
     * 세션 내 고유 클러스터 번호 (1부터 시작, 자동 증가)
     */
    @Field("cluster_number")
    private Integer clusterNumber;

    /**
     * 병합 상태:
     * -1 = 미병합 (독립 클러스터)
     * >0 = 해당 cluster_number의 병합 클러스터에 소속
     */
    @Field("cluster_id")
    @Builder.Default
    private Integer clusterId = -1;

    /**
     * 세부 병합 상태 (Step 7 Detail Clustering):
     * -1 = 세부병합 없음
     * >0 = 해당 cluster_number의 세부병합 클러스터에 소속
     */
    @Field("cluster_sub_id")
    @Builder.Default
    private Integer clusterSubId = -1;

    /**
     * 클러스터명 (키워드 조합 등)
     */
    @Field("cluster_name")
    private String clusterName;

    /**
     * 클러스터에 포함된 키워드 목록
     */
    @Field("keywords")
    @Builder.Default
    private List<String> keywords = new ArrayList<>();

    /**
     * 클러스터에 포함된 데이터 행 수
     */
    @Field("count")
    @Builder.Default
    private Integer count = 0;

    /**
     * 금액 합산 (process_view_data.money 합계)
     */
    @Field("total_amount")
    @Builder.Default
    private Double totalAmount = 0.0;

    /**
     * 클러스터에 포함된 session_data의 raw_data_id 배열
     */
    @Field("data_indices")
    @Builder.Default
    private List<String> dataIndices = new ArrayList<>();

    /**
     * 공급업체명 (클러스터링 조건에 공급업체가 포함된 경우)
     */
    @Field("supplier")
    private String supplier;

    /**
     * 코스트센터/부서명 (클러스터링 조건에 코스트센터가 포함된 경우)
     */
    @Field("department")
    private String department;

    /**
     * User-defined cluster name (set via rename or customMergeName).
     * null = auto-generated name (keyword join).
     * When non-null, merge/addToMerged operations preserve this value
     * instead of regenerating from keywords.
     */
    @Field("custom_name")
    private String customName;

    /**
     * 병합 처리 상태 (부모 클러스터 전용):
     * null = 일반 클러스터 (미병합/자식)
     * "PROCESSING" = 병합 진행 중 (자식 업데이트 미완료)
     * "COMPLETED" = 병합 완료
     */
    @Field("merge_status")
    private String mergeStatus;

    /**
     * 생성 시간
     */
    @Field("created_at")
    private LocalDateTime createdAt;
}
