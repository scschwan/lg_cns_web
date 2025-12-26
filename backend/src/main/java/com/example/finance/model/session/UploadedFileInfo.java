package com.example.finance.model.session;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 업로드된 파일 정보 (FileSession 내 임베디드)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UploadedFileInfo {

    /**
     * 파일 ID (ObjectId 문자열)
     */
    @Field("file_id")
    private String fileId;

    /**
     * 파일명
     */
    @Field("file_name")
    private String fileName;

    /**
     * 파일 크기 (bytes)
     */
    @Field("file_size")
    private Long fileSize;

    /**
     * S3 키
     */
    @Field("s3_key")
    private String s3Key;

    /**
     * 행 개수
     */
    @Field("row_count")
    private Long rowCount;

    /**
     * 업로드 시간
     */
    @Field("uploaded_at")
    private LocalDateTime uploadedAt;

    // ⭐ 컬럼 설정 (사용자 선택)

    /**
     * 계정명 컬럼명
     */
    @Field("account_column_name")
    private String accountColumnName;

    /**
     * 금액 컬럼명
     */
    @Field("amount_column_name")
    private String amountColumnName;

    /**
     * 자동 감지된 컬럼 목록
     */
    @Field("detected_columns")
    @Builder.Default
    private List<String> detectedColumns = new ArrayList<>();

    /**
     * 계정명 고유값 목록 (미리보기용)
     */
    @Field("account_contents")
    @Builder.Default
    private List<String> accountContents = new ArrayList<>();

    // ⭐ 신규 필드 추가
    /**
     * 금액 합계
     */
    @Field("total_amount")
    private Double totalAmount;
}