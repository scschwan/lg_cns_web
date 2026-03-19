package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.LongShortList;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Long/Short List Repository
 *
 * 프로젝트별 Long List / Short List 선택 데이터에 대한 접근 계층.
 * 프로젝트 ID 기준 조회/삭제 기능을 제공한다.
 */
@Repository
public interface LongShortListRepository extends MongoRepository<LongShortList, String> {

    Optional<LongShortList> findFirstByProjectId(String projectId);

    boolean existsByProjectId(String projectId);

    void deleteByProjectId(String projectId);
}
