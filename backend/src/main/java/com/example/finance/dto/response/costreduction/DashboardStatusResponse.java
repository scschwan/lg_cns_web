package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardStatusResponse {

    private String projectId;
    private String currentPhase;
    private Boolean isListLocked;
    private Boolean isEditor;
    private String editorUserId;
    private String editorUserName;
}
