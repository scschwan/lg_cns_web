package com.example.finance.dto.response.session;

import com.example.finance.enums.ProcessStep;
import com.example.finance.model.session.StepHistory;
import com.example.finance.model.session.UploadedFileInfo;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 파일 세션 응답
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileSessionResponse {

    private String sessionId;
    private String projectId;
    private String sessionName;
    private String workerName;
    private Integer totalFiles;
    private Long totalRowCount;
    private Long totalAmount;

    // 진행 상태
    private ProcessStep currentStep;
    private Integer progressPercentage;
    private Boolean isCompleted;

    // 시간
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastAccessedAt;
    private LocalDateTime completedAt;

    // 파일 정보 (선택적)
    private List<UploadedFileInfo> uploadedFiles;

    // 단계 이력 (선택적)
    private List<StepHistory> stepHistory;
}