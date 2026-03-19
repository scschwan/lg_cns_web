package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** 대시보드 잠금 상태 응답 DTO (세션 완료 시 사전 체크용) */
public class DashboardLockStatusResponse {

    private Boolean dashboardExists;
    private Boolean isLocked;
    private String editorUserId;
    private String editorUserName;
    private String currentPhase;
}
