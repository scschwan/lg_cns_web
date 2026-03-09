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

    @EventListener(ApplicationReadyEvent.class)
    public void ensureIndexes() {
        try {
            // session_data: updateMulti 성능을 위한 복합 인덱스
            mongoTemplate.indexOps("session_data").ensureIndex(
                    new Index()
                            .named("session_rawdata_idx")
                            .on("session_id", Sort.Direction.ASC)
                            .on("raw_data_id", Sort.Direction.ASC)
            );
            log.info("[INDEX] session_data.session_rawdata_idx 인덱스 생성/확인 완료");
        } catch (Exception e) {
            log.error("[INDEX] 인덱스 생성 실패: {}", e.getMessage(), e);
        }
    }
}
