package com.example.finance.dto.request.upload;

import lombok.Builder;
import lombok.Data;

import java.util.List;

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
