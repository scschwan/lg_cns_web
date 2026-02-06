package com.example.finance.repository.admin;

import com.example.finance.model.admin.AuditLog;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AuditLogRepository extends MongoRepository<AuditLog, String> {

    List<AuditLog> findByAdminId(String adminId, Sort sort);

    List<AuditLog> findByTargetType(String targetType, Sort sort);

    List<AuditLog> findByTargetTypeAndTargetId(String targetType, String targetId, Sort sort);

    List<AuditLog> findByCreatedAtBetween(LocalDateTime start, LocalDateTime end, Sort sort);
}
