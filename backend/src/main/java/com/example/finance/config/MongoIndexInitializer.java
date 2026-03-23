package com.example.finance.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.stereotype.Component;

/**
 * 애플리케이션 시작 시 필수 MongoDB 인덱스를 프로그래밍 방식으로 생성.
 *
 * autoIndexCreation=true를 사용하면 ProjectMember가 projects 컬렉션에
 * embedded될 때 unique 인덱스 충돌이 발생하므로, 필요한 인덱스만 선택적으로 생성한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MongoIndexInitializer {

    private final MongoTemplate mongoTemplate;

    /**
     * 애플리케이션 준비 완료 시 필수 인덱스를 생성한다
     *
     * <p>생성되는 인덱스:</p>
     * <ul>
     *   <li>session_data: (session_id + raw_data_id) - updateMulti 성능 최적화</li>
     *   <li>process_data: (session_id + is_hidden) - 페이징 쿼리 성능 최적화</li>
     *   <li>process_view_data: (process_data_id) - process_data 조인 성능</li>
     *   <li>process_view_data: (session_id) - 세션 기반 조회 성능</li>
     *   <li>session_data: (session_id + is_hidden) - 페이징 쿼리 성능 최적화</li>
     * </ul>
     */
    @EventListener(ApplicationReadyEvent.class)
    public void ensureIndexes() {
        // session_data: updateMulti 성능을 위한 복합 인덱스
        createIndex("session_data", "session_rawdata_idx",
                new Index().on("session_id", Sort.Direction.ASC).on("raw_data_id", Sort.Direction.ASC));

        // process_data: 페이징 쿼리 성능 (session_id + is_hidden 필터)
        createIndex("process_data", "session_hidden_idx",
                new Index().on("session_id", Sort.Direction.ASC).on("is_hidden", Sort.Direction.ASC));

        // process_view_data: process_data_id 기반 조인
        createIndex("process_view_data", "process_data_id_idx",
                new Index().on("process_data_id", Sort.Direction.ASC));

        // process_view_data: session 기반 조회
        createIndex("process_view_data", "session_id_idx",
                new Index().on("session_id", Sort.Direction.ASC));

        // session_data: 페이징 쿼리 성능 (is_hidden 포함)
        createIndex("session_data", "session_hidden_idx",
                new Index().on("session_id", Sort.Direction.ASC).on("is_hidden", Sort.Direction.ASC));

        // session_data: 3필드 커버링 인덱스 (session_id + is_hidden + raw_data_id 쿼리 최적화)
        createIndex("session_data", "session_hidden_rawdata_idx",
                new Index().on("session_id", Sort.Direction.ASC)
                           .on("is_hidden", Sort.Direction.ASC)
                           .on("raw_data_id", Sort.Direction.ASC));
    }

    /**
     * 지정된 컬렉션에 인덱스를 생성하거나 기존 인덱스를 확인한다
     *
     * <p>인덱스가 이미 존재하면 무시하고, 생성 실패 시 에러 로그를 남기되
     * 애플리케이션 시작을 중단하지 않는다.</p>
     *
     * @param collection 대상 컬렉션명
     * @param indexName  인덱스 이름
     * @param index      인덱스 정의 객체
     */
    private void createIndex(String collection, String indexName, Index index) {
        try {
            mongoTemplate.indexOps(collection).ensureIndex(index.named(indexName));
            log.info("[INDEX] {}.{} 인덱스 생성/확인 완료", collection, indexName);
        } catch (Exception e) {
            log.error("[INDEX] {}.{} 인덱스 생성 실패: {}", collection, indexName, e.getMessage());
        }
    }
}
