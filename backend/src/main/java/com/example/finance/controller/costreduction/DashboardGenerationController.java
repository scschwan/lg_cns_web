package com.example.finance.controller.costreduction;

import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.costreduction.DashboardGenerationService;
import com.example.finance.service.costreduction.DashboardGenerationService.SessionConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 대시보드 프로젝트 배치 데이터 생성 컨트롤러
 *
 * 업로드된 파일의 raw_data를 읽어 cluster_statistics를
 * 병렬 스레드로 생성한다.
 */
@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/dashboard/generate")
@RequiredArgsConstructor
public class DashboardGenerationController {

    private final DashboardGenerationService generationService;

    /**
     * 배치 데이터 생성 시작
     *
     * POST /api/projects/{projectId}/dashboard/generate/batch
     */
    @PostMapping("/batch")
    public ResponseEntity<Map<String, Object>> startBatchGeneration(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal,
            @RequestBody Map<String, Object> request) {

        @SuppressWarnings("unchecked")
        List<Map<String, String>> sessionsRaw = (List<Map<String, String>>) request.get("sessions");

        List<SessionConfig> configs = sessionsRaw.stream().map(m -> {
            SessionConfig c = new SessionConfig();
            c.sessionId = m.get("sessionId");
            c.accountName = m.get("accountName");
            c.accountColumn = m.get("accountColumn");
            c.clusterColumn = m.get("clusterColumn");
            c.subClusterColumn = m.get("subClusterColumn");
            c.amountColumn = m.get("amountColumn");
            c.supplierColumn = m.get("supplierColumn");
            c.costCenterColumn = m.get("costCenterColumn");
            return c;
        }).collect(Collectors.toList());

        log.info("대시보드 배치 생성 요청: projectId={}, userId={}, sessions={}",
                projectId, userPrincipal.getId(), configs.size());

        Map<String, Object> result = generationService.startBatchGeneration(
                projectId, userPrincipal.getId(), configs);

        return ResponseEntity.ok(result);
    }

    /**
     * 배치 생성 진행 상태 조회
     *
     * GET /api/projects/{projectId}/dashboard/generate/status
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus(@PathVariable String projectId) {
        return ResponseEntity.ok(generationService.getStatus(projectId));
    }
}
