package com.example.finance.dto;

import lombok.Data;

@Data
public class PresignedUrlRequest {
    private String fileName;
    private Long fileSize;
    private String sessionId;
}