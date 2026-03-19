package com.example.finance.dto.response.costreduction;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Long List 트리 응답 DTO
 *
 * 계정 > 클러스터 > 세부클러스터 형태의 트리 구조를 반환한다.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LongListTreeResponse {

    private List<TreeNode> tree;
}
