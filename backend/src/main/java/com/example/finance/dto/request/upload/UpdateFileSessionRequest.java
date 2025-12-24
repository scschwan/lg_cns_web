package com.example.finance.dto.request.upload;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 파일 세션 수정 요청 (세션명, 작업자명)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateFileSessionRequest {

    /**
     * 세션명 (null이면 수정 안 함)
     */
    private String sessionName;

    /**
     * 작업자명 (null이면 수정 안 함)
     */
    private String workerName;
}