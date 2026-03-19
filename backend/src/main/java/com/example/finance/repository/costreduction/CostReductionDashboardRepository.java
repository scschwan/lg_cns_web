package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.CostReductionDashboard;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 원가절감 대시보드 Repository
 *
 * cost_reduction_dashboard 컬렉션에 대한 데이터 접근 계층.
 * 프로젝트별 대시보드 상태(페이즈, 잠금) 관리 기능을 제공한다.
 */
@Repository
public interface CostReductionDashboardRepository extends MongoRepository<CostReductionDashboard, String> {

    Optional<CostReductionDashboard> findFirstByProjectId(String projectId);

    boolean existsByProjectId(String projectId);

    void deleteByProjectId(String projectId);
}
