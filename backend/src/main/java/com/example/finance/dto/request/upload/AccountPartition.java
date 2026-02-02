package com.example.finance.dto.request.upload;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AccountPartition {
    private String fileId;
    private String fileName;
    private String accountName;  // 대계정명 (예: 지급수수료)
    private long rowCount;       // 해당 계정의 행 수
    private double totalAmount;  // 해당 계정의 금액 합계
}