package com.example.finance.dto.request.upload;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 세션 병합 요청
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MergeSessionsRequest {

    /**
     * 새 세션명
     */
    @NotBlank(message = "새 세션명은 필수입니다")
    private String newSessionName;

    /**
     * 작업자명
     */
    private String workerName;

    /**
     * 병합할 세션 ID 목록 (최소 2개)
     */
    @NotEmpty(message = "최소 2개 이상의 세션을 선택해야 합니다")
    @Size(min = 2, message = "최소 2개 이상의 세션을 선택해야 합니다")
    private List<String> sessionIds;
}