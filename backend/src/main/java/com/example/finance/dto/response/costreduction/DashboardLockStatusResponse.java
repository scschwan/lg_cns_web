package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardLockStatusResponse {

    private Boolean dashboardExists;
    private Boolean isLocked;
    private String editorUserId;
    private String editorUserName;
    private String currentPhase;
}
