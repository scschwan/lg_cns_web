package com.example.finance.model.admin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;

@Document(collection = "audit_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLog {

    @Id
    private String id;

    @Indexed
    @Field("admin_id")
    private String adminId;

    @Indexed
    @Field("user_id")
    private String userId;

    @Field("user_name")
    private String userName;

    @Field("action")
    private String action;

    @Indexed
    @Field("target_type")
    private String targetType;

    @Indexed
    @Field("target_id")
    private String targetId;

    @Field("detail")
    private String detail;

    @Field("created_at")
    private LocalDateTime createdAt;
}
