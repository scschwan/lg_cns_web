package com.example.finance.dto.request.upload;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 세션 이름 업데이트 요청
 *
 * 세션명과 작업자명을 수정
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateSessionNameRequest {

    /**
     * 세션명 (필수)
     */
    @NotBlank(message = "세션명은 필수입니다")
    private String sessionName;

    /**
     * 작업자명 (선택)
     */
    private String workerName;
}