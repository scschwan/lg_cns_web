// backend/src/main/java/com/example/finance/dto/upload/SessionResponse.java

package com.example.finance.dto.response.upload;

import lombok.Builder;
import lombok.Data;
import java.math.BigDecimal;

@Data
@Builder
public class SessionResponse {
    private String id;
    private String sessionId;
    private String sessionName;
    private String accountName;
    private Integer fileCount;
    private Long totalRows;
    private BigDecimal totalAmount;
    private Boolean status;
    private String resultFilePath;
}