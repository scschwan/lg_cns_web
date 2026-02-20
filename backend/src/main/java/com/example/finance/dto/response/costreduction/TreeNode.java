package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TreeNode {

    private String id;
    private String statisticsId;
    private String sessionId;
    private String accountName;
    private Integer clusterNumber;
    private String clusterName;
    private Integer level;
    private Integer parentClusterNumber;
    private Integer totalCount;
    private Double totalAmount;
    private Integer supplierCount;
    private Integer costCenterCount;

    @Builder.Default
    private List<TreeNode> children = new ArrayList<>();
}
