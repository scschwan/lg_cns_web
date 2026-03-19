package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 대시보드 상태 응답 DTO
 *
 * 현재 페이즈, 리스트 잠금 여부, 편집자 정보 등의 상태를 반환한다.
 */
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
