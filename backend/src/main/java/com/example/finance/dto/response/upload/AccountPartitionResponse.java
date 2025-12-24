package com.example.finance.dto.response.upload;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 계정 파티션 정보
 *
 * 파일 분석 결과로 반환되는 계정별 파티션 데이터
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AccountPartitionResponse {

    /**
     * 계정명 (필수)
     *
     * 엑셀 파일에서 추출된 계정명
     */
    @NotBlank(message = "계정명은 필수입니다")
    private String accountName;

    /**
     * 세션명 (필수)
     *
     * 이 파티션으로 생성될 세션의 이름
     */
    @NotBlank(message = "세션명은 필수입니다")
    private String sessionName;

    /**
     * 작업자명 (선택)
     *
     * 이 세션의 작업 담당자
     */
    private String workerName;

    /**
     * 파일 ID 리스트 (필수)
     *
     * 이 파티션에 포함될 파일들의 ObjectId
     */
    @NotEmpty(message = "최소 1개 이상의 파일이 필요합니다")
    private List<String> fileIds;

    /**
     * 파일 개수
     *
     * 이 파티션에 포함된 파일 개수
     */
    private Integer fileCount;

    /**
     * 총 행 개수
     *
     * 이 파티션의 모든 파일의 총 행 개수
     */
    private Long totalRows;

    /**
     * 총 금액
     *
     * 이 파티션의 모든 파일의 금액 합계
     */
    private Double totalAmount;
}