package com.example.finance.dto.request.upload;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 계정 파티션 DTO
 *
 * 파일 분석 결과로 생성되는 계정별 파티션 정보.
 * 세션 일괄 생성 시 각 파티션의 파일 목록, 계정명, 행 수, 금액 등을 전달한다.
 */
@Data
@Builder
public class AccountPartition {
    private String fileId;
    private List<String> fileIds; // ⭐ [필수 추가] 세션 생성 서비스가 참조하는 필드

    private String fileName;
    private String accountName;

    private String sessionName;
    private String workerName;

    // 프론트엔드 매핑 호환성을 위해 필드명 확인 필요
    private long rowCount;
    private double totalAmount;
}
