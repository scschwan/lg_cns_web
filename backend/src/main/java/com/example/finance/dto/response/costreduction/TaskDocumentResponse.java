package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** 과제 첨부 문서 응답 DTO */
public class TaskDocumentResponse {

    private String id;
    private String taskId;
    private String type;
    private String name;
    private String label;
    private String url;
    private LocalDateTime createdAt;
}
