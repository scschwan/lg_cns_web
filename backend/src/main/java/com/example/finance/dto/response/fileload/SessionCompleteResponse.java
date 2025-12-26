// backend/src/main/java/com/example/finance/dto/response/fileload/SessionCompleteResponse.java

package com.example.finance.dto.response.fileload;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionCompleteResponse {
    private String sessionId;
    private boolean success;
    private int processedFileCount;
    private int processedRowCount;
    private String message;
}