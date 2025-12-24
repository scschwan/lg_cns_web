// FileMetadataResponse.java
package com.example.finance.dto.response.upload;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileMetadataResponse {
    private String id;
    private String projectId;
    private String fileName;
    private Long fileSize;
    private String s3Key;
    private List<String> detectedColumns;
    private Integer rowCount;
    private String accountColumn;
    private String amountColumn;
    private List<String> accountValues;
    private Double totalAmount;
    private LocalDateTime createdAt;
}