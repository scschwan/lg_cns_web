package com.example.finance.dto.request.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaveListRequest {

    private List<ListItemDto> items;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ListItemDto {
        private String statisticsId;
        private String sessionId;
        private String accountName;
        private Integer clusterNumber;
        private String clusterName;
        private Integer level;
        private Integer parentClusterNumber;
        private Double totalAmount;
        private Integer totalCount;
    }
}
