package com.example.finance.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.validation.constraints.NotBlank;

/**
 * 파일 컬럼 설정 요청 (계정명, 금액 컬럼)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SetFileColumnsRequest {

    /**
     * 파일 ID
     */
    @NotBlank(message = "파일 ID는 필수입니다")
    private String fileId;

    /**
     * 계정명 컬럼명
     */
    @NotBlank(message = "계정명 컬럼은 필수입니다")
    private String accountColumnName;

    /**
     * 금액 컬럼명
     */
    @NotBlank(message = "금액 컬럼은 필수입니다")
    private String amountColumnName;
}