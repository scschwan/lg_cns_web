package com.example.finance.repository.admin;

import com.example.finance.model.admin.MaintenanceStatus;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

/**
 * 시스템 유지보수 상태 Repository
 */
@Repository
public interface MaintenanceRepository extends MongoRepository<MaintenanceStatus, String> {
}
