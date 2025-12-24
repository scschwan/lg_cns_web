package com.example.finance.dto.response.upload;

import com.example.finance.enums.ProcessStep;
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

    /**
     * 세션 ID (UUID)
     */
    private String sessionId;

    /**
     * 프로젝트 ID
     */
    private String projectId;

    /**
     * 세션명
     */
    private String sessionName;

    /**
     * 작업자명
     */
    private String workerName;

    /**
     * 생성자 ID
     */
    private String createdBy;

    /**
     * 생성 시간
     */
    private LocalDateTime createdAt;

    /**
     * 수정 시간
     */
    private LocalDateTime updatedAt;

    /**
     * 업로드된 파일 목록
     */
    private List<UploadedFileInfo> uploadedFiles;

    /**
     * 총 파일 수
     */
    private Integer totalFiles;

    /**
     * 총 행 수
     */
    private Long totalRowCount;

    /**
     * 합산 금액
     */
    private Long totalAmount;

    /**
     * 현재 진행 단계
     */
    private ProcessStep currentStep;

    /**
     * 진행률 (0~100)
     */
    private Integer progressPercentage;

    /**
     * 완료 여부
     */
    private Boolean isCompleted;

    /**
     * 완료 시간
     */
    private LocalDateTime completedAt;

    /**
     * Export 파일 경로
     */
    private String exportPath;

    /**
     * 계정명 목록
     */
    private List<String> accountNames;

    /**
     * 계정명 컬럼명 목록
     */
    private List<String> accountColumnNames;
}