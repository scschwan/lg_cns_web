package com.example.finance.model.data;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Raw 데이터 문서
 *
 * MongoDB 컬렉션: raw_data
 *
 * Phase 1: Lambda에서 파싱하여 생성
 * Phase 2: FileSession과 연결
 */
@Document(collection = "raw_data")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@CompoundIndex(name = "project_session_idx", def = "{'project_id': 1, 'session_id': 1}")
@CompoundIndex(name = "session_upload_idx", def = "{'session_id': 1, 'upload_id': 1}")
@CompoundIndex(name = "upload_row_idx", def = "{'upload_id': 1, 'row_number': 1}")
public class RawDataDocument {

    @Id
    private String id;

    /**
     * 프로젝트 ID (Phase 2 추가)
     */
    @Indexed
    @Field("project_id")
    private String projectId;

    /**
     * 세션 ID (Phase 1: Lambda 세션, Phase 2: FileSession)
     */
    @Indexed
    @Field("session_id")
    private String sessionId;

    /**
     * 업로드 ID (파일 식별자)
     * Phase 1: UploadSession의 uploadId
     */
    @Indexed
    @Field("upload_id")
    private String uploadId;

    /**
     * 행 번호 (1부터 시작)
     */
    @Field("row_number")
    private Integer rowNumber;

    /**
     * 원본 데이터 (가변 필드)
     * Excel 컬럼 → MongoDB 필드 매핑
     */
    private Map<String, Object> data;

    /**
     * 생성 시간
     */
    @Field("created_at")
    private LocalDateTime createdAt;

    /**
     * 수정 시간 (옵션)
     */
    @Field("updated_at")
    private LocalDateTime updatedAt;
}