// backend/src/main/java/com/example/finance/dto/upload/AccountPartition.java

package com.example.finance.dto.request.upload;

import com.example.finance.model.session.UploadedFileInfo;
import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

@Data
public class AccountPartition {
    private String accountName;
    private String sessionName;
    private List<UploadedFileInfo> files;
    private Integer fileCount;
    private Long totalRows;
    private BigDecimal totalAmount;

    public Integer getFileCount() {
        return files != null ? files.size() : 0;
    }
}