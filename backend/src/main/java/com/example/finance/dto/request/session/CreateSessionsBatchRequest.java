package com.example.finance.dto.request.session;

import com.example.finance.dto.request.upload.AccountPartition;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class CreateSessionsBatchRequest {

    @NotEmpty(message = "생성할 파티션 정보가 없습니다.")
    @Valid // 내부 리스트 요소들도 검증
    private List<AccountPartition> partitions;
}