package com.example.finance.repository.admin;

import com.example.finance.model.admin.AuditLog;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 감사 로그 Repository
 *
 * audit_logs 컬렉션에 대한 데이터 접근 계층.
 * 관리자 ID, 대상 유형/ID, 기간 기준 조회 기능을 제공한다.
 */
@Repository
public interface AuditLogRepository extends MongoRepository<AuditLog, String> {

    List<AuditLog> findByAdminId(String adminId, Sort sort);

    List<AuditLog> findByTargetType(String targetType, Sort sort);

    List<AuditLog> findByTargetTypeAndTargetId(String targetType, String targetId, Sort sort);

    List<AuditLog> findByCreatedAtBetween(LocalDateTime start, LocalDateTime end, Sort sort);
}
