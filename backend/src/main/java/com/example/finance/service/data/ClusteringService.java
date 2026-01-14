package com.example.finance.service.data;

import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.data.ProcessDataDocument;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

/**
 * 클러스터링 서비스 (Step 5)
 *
 * C# 원본: uc_Clustering.cs
 * - 사용자 기반 클러스터링 (KMEANS 제거)
 * - 클러스터 병합 로직
 * - clustering_results 저장
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClusteringService {

    private final MongoTemplate mongoTemplate;

    // ⭐ 병렬 처리용 스레드 풀 (CPU 코어 * 4)
    private final ExecutorService executorService = Executors.newFixedThreadPool(
            Runtime.getRuntime().availableProcessors() * 4
    );

    private static final int BATCH_SIZE = 20000;

    /**
     * 사용자 기반 클러스터링 (배치 처리)
     *
     * C# 원본: 사용자가 직접 클러스터 할당
     * - UI에서 선택된 데이터에 cluster_id 할당
     * - clustering_results 생성
     */
    public void assignClusterToRecords(
            String sessionId,
            String projectId,
            List<String> processDataIds,
            Integer clusterId,
            String clusterName
    ) {
        log.info("Assigning cluster: clusterId={}, recordCount={}", clusterId, processDataIds.size());

        // 1. process_data 업데이트 (cluster_id, cluster_name)
        Query query = new Query(
                Criteria.where("_id").in(processDataIds)
                        .and("session_id").is(sessionId)
        );

        Update update = new Update()
                .set("cluster_id", clusterId)
                .set("cluster_name", clusterName)
                .set("updated_at", LocalDateTime.now());

        mongoTemplate.updateMulti(query, update, ProcessDataDocument.class);

        // 2. clustering_results 업데이트 (또는 생성)
        updateClusteringResult(sessionId, projectId, clusterId, clusterName);

        log.info("Cluster assigned successfully");
    }

    /**
     * 클러스터 병합 로직
     *
     * C# 원본: MergeAndCreateNewCluster()
     *
     * 작업:
     * 1. 기존 클러스터들의 데이터를 새 클러스터로 변경
     * 2. clustering_results 업데이트
     */
    public void mergeClusters(
            String sessionId,
            String projectId,
            List<Integer> sourceClusterIds,
            Integer newClusterId,
            String newClusterName
    ) {
        log.info("Merging clusters: {} → clusterId={}", sourceClusterIds, newClusterId);

        // 1. process_data 업데이트 (병합)
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").in(sourceClusterIds)
        );

        Update update = new Update()
                .set("cluster_id", newClusterId)
                .set("cluster_name", newClusterName)
                .set("updated_at", LocalDateTime.now());

        mongoTemplate.updateMulti(query, update, ProcessDataDocument.class);

        // 2. 기존 clustering_results 삭제
        Query deleteQuery = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").in(sourceClusterIds)
        );
        mongoTemplate.remove(deleteQuery, ClusteringResult.class);

        // 3. 새 clustering_results 생성
        updateClusteringResult(sessionId, projectId, newClusterId, newClusterName);

        log.info("Clusters merged successfully");
    }

    /**
     * clustering_results 업데이트/생성
     */
    private void updateClusteringResult(
            String sessionId,
            String projectId,
            Integer clusterId,
            String clusterName
    ) {
        // process_data에서 클러스터 통계 계산
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(clusterId)
        );

        long recordCount = mongoTemplate.count(query, ProcessDataDocument.class);

        // clustering_results 조회 또는 생성
        Query resultQuery = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(clusterId)
        );

        ClusteringResult existingResult = mongoTemplate.findOne(
                resultQuery,
                ClusteringResult.class
        );

        if (existingResult != null) {
            // 업데이트
            Update update = new Update()
                    .set("cluster_name", clusterName)
                    .set("record_count", recordCount)
                    .set("updated_at", LocalDateTime.now());

            mongoTemplate.updateFirst(resultQuery, update, ClusteringResult.class);
        } else {
            // 신규 생성
            ClusteringResult newResult = ClusteringResult.builder()
                    .sessionId(sessionId)
                    .projectId(projectId)
                    .clusterId(clusterId)
                    .clusterName(clusterName)
                    .recordCount(recordCount)
                    .createdAt(LocalDateTime.now())
                    .build();

            mongoTemplate.insert(newResult);
        }
    }

    /**
     * 클러스터 결과 조회
     */
    public List<ClusteringResult> getClusteringResults(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId));
        query.with(org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Direction.ASC,
                "cluster_id"
        ));

        return mongoTemplate.find(query, ClusteringResult.class);
    }

    /**
     * 클러스터명 수정
     */
    public void updateClusterName(
            String sessionId,
            Integer clusterId,
            String newClusterName
    ) {
        // 1. clustering_results 업데이트
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(clusterId)
        );

        Update update = new Update()
                .set("cluster_name", newClusterName)
                .set("updated_at", LocalDateTime.now());

        mongoTemplate.updateFirst(query, update, ClusteringResult.class);

        // 2. process_data 업데이트
        Query processQuery = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(clusterId)
        );

        Update processUpdate = new Update()
                .set("cluster_name", newClusterName)
                .set("updated_at", LocalDateTime.now());

        mongoTemplate.updateMulti(processQuery, processUpdate, ProcessDataDocument.class);

        log.info("Cluster name updated: clusterId={}, newName={}", clusterId, newClusterName);
    }

    /**
     * 클러스터별 데이터 조회
     */
    public List<ProcessDataDocument> getClusterData(
            String sessionId,
            Integer clusterId,
            int page,
            int size
    ) {
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(clusterId)
        );

        query.skip((long) (page - 1) * size);
        query.limit(size);

        return mongoTemplate.find(query, ProcessDataDocument.class);
    }

    /**
     * 클러스터별 데이터 개수
     */
    public long countClusterData(String sessionId, Integer clusterId) {
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(clusterId)
        );

        return mongoTemplate.count(query, ProcessDataDocument.class);
    }

    /**
     * 클러스터 삭제
     *
     * ⚠️ process_data의 cluster_id를 -1(미병합)로 변경
     */
    public void deleteCluster(String sessionId, Integer clusterId) {
        log.warn("Deleting cluster: clusterId={}", clusterId);

        // 1. process_data 업데이트 (cluster_id = -1)
        Query processQuery = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(clusterId)
        );

        Update processUpdate = new Update()
                .set("cluster_id", -1)
                .set("cluster_name", null)
                .set("updated_at", LocalDateTime.now());

        mongoTemplate.updateMulti(processQuery, processUpdate, ProcessDataDocument.class);

        // 2. clustering_results 삭제
        Query resultQuery = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(clusterId)
        );

        mongoTemplate.remove(resultQuery, ClusteringResult.class);

        log.info("Cluster deleted successfully");
    }
}