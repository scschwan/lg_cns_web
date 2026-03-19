package com.example.finance.dto.request.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Long/Short List 저장 요청 DTO
 *
 * 사용자가 선택한 Long List / Short List 항목을 저장하기 위한 요청.
 * 각 항목에는 통계 ID, 세션 ID, 계정명, 클러스터 정보, 금액/건수 등이 포함된다.
 */
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
