package com.example.finance.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresignedUrlResponse {
    private String uploadId;
    private String presignedUrl;
    private String s3Bucket;
    private String s3Key;
    private Long expiresIn;  // 초 단위
}