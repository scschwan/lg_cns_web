// PresignedUrlRequest.java
package com.example.finance.dto.request.upload;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.util.List;

@Data
public class PresignedUrlRequest {
    @NotBlank(message = "파일명은 필수입니다")
    private String fileName;

    @NotNull(message = "파일 크기는 필수입니다")
    @Positive(message = "파일 크기는 양수여야 합니다")
    private Long fileSize;

    private List<String> detectedColumns;
    private Integer rowCount;
}