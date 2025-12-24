package com.example.finance.dto.request.upload;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 파일 업로드 완료 요청
 *
 * S3 업로드 완료 후 Backend에 파일 메타데이터 저장 요청
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UploadFileRequest {

    /**
     * 업로드 ID (Presigned URL 생성 시 받은 ID)
     */
    @NotBlank(message = "uploadId는 필수입니다")
    private String uploadId;



    /**
     * 파일명
     */
    @NotBlank(message = "fileName은 필수입니다")
    private String fileName;

    /**
     * 파일 크기 (bytes)
     */
    @NotNull(message = "fileSize는 필수입니다")
    private Long fileSize;

    /**
     * S3 키
     */
    @NotBlank(message = "s3Key는 필수입니다")
    private String s3Key;

    /**
     * 세션 ID (Presigned URL 생성 시 받은 ID)
     */
    @NotBlank(message = "sessionId는 필수입니다")
    private String sessionId;

    // ⭐ 옵션: Excel 메타데이터
    private List<String> detectedColumns;
    private Integer rowCount;
}