package com.example.finance.dto.request.upload;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 파일 세션 생성 요청
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateFileSessionRequest {

    /**
     * 프로젝트 ID
     */
    @NotBlank(message = "프로젝트 ID는 필수입니다")
    private String projectId;

    /**
     * 세션명
     */
    @NotBlank(message = "세션명은 필수입니다")
    private String sessionName;

    /**
     * 작업자명
     */
    private String workerName;

    /**
     * 파일 ID 목록 (체크박스로 선택한 파일들)
     */
    @NotEmpty(message = "최소 1개 이상의 파일을 선택해야 합니다")
    private List<String> fileIds;
}