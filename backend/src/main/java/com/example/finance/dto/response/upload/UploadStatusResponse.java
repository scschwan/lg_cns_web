package com.example.finance.dto.response.upload;

import com.example.finance.model.upload.UploadSession;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UploadStatusResponse {
    private String uploadId;
    private String fileName;
    private UploadSession.UploadStatus status;
    private Integer progress;
    private Integer totalRows;
    private Integer processedRows;
    private String errorMessage;
    private String message;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime completedAt;
}