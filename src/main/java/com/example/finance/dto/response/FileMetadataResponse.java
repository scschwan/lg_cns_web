package com.example.finance.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 파일 메타데이터 응답
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileMetadataResponse {

    private String fileId;
    private String fileName;
    private Long fileSize;
    private Long rowCount;
    private String s3Key;

    // 컬럼 설정
    private String accountColumnName;
    private String amountColumnName;
    private List<String> detectedColumns;
    private List<String> accountContents;

    private LocalDateTime uploadedAt;
}