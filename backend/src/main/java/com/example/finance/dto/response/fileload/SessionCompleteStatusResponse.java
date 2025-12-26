// backend/src/main/java/com/example/finance/dto/response/fileload/SessionCompleteStatusResponse.java

package com.example.finance.dto.response.fileload;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionCompleteStatusResponse {
    private String status;  // PROCESSING, COMPLETED, FAILED, NOT_STARTED
    private int progress;   // 0-100
    private String message;
}