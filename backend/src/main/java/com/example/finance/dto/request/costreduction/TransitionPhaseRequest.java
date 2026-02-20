package com.example.finance.dto.request.costreduction;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TransitionPhaseRequest {

    @NotBlank(message = "대상 단계는 필수입니다")
    private String targetPhase;
}
