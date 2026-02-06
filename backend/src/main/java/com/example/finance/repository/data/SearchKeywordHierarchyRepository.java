package com.example.finance.repository.data;

import com.example.finance.model.data.SearchKeywordHierarchy;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * SearchKeywordHierarchy Repository
 * 검색 키워드 계층 구조 관리
 */
@Repository
public interface SearchKeywordHierarchyRepository extends MongoRepository<SearchKeywordHierarchy, String> {

    /**
     * 세션의 전체 키워드 계층 조회 (레벨, 순서 기준 정렬)
     */
    List<SearchKeywordHierarchy> findBySessionIdOrderByLevelAscDisplayOrderAsc(String sessionId);

    /**
     * 세션의 특정 레벨 키워드 조회
     */
    List<SearchKeywordHierarchy> findBySessionIdAndLevelOrderByDisplayOrderAsc(String sessionId, Integer level);

    /**
     * 특정 부모 아래의 자식 키워드 조회
     */
    List<SearchKeywordHierarchy> findBySessionIdAndParentIdOrderByDisplayOrderAsc(String sessionId, String parentId);

    /**
     * 세션의 모든 키워드 삭제
     */
    void deleteBySessionId(String sessionId);

    /**
     * 특정 부모 아래의 모든 자식 삭제
     */
    void deleteBySessionIdAndParentId(String sessionId, String parentId);

    /**
     * 세션의 키워드 수 카운트
     */
    long countBySessionId(String sessionId);

    /**
     * 특정 레벨의 키워드 수 카운트
     */
    long countBySessionIdAndLevel(String sessionId, Integer level);
}
