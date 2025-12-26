// backend/src/main/java/com/example/finance/dto/upload/PartitionAnalysisResponse.java

package com.example.finance.dto.response.upload;

import com.example.finance.dto.request.upload.AccountPartition;
import lombok.Builder;
import lombok.Data;
import java.util.List;

@Data
@Builder
public class PartitionAnalysisResponse {
    private List<AccountPartition> partitions;
}