package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.CostReductionDashboard;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CostReductionDashboardRepository extends MongoRepository<CostReductionDashboard, String> {

    Optional<CostReductionDashboard> findFirstByProjectId(String projectId);

    boolean existsByProjectId(String projectId);

    void deleteByProjectId(String projectId);
}
