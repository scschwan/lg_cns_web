package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** 편집자 잠금 응답 DTO */
public class LockResponse {

    private Boolean isEditor;
    private String editorUserId;
    private String editorUserName;
}
