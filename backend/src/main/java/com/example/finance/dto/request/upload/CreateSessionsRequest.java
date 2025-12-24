package com.example.finance.dto.request.upload;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

import com.example.finance.dto.response.upload.AccountPartitionResponse;

/**
 * 세션 파티션 생성 요청
 *
 * 여러 계정 파티션을 기반으로 세션들을 일괄 생성
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateSessionsRequest {

    /**
     * 계정별 파티션 정보 리스트
     *
     * 각 파티션은 하나의 세션으로 생성됨
     */
    @NotEmpty(message = "최소 1개 이상의 파티션이 필요합니다")
    @Valid
    private List<AccountPartitionResponse> partitions;
}