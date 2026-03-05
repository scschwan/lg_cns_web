package com.example.finance.controller.data;

import com.example.finance.service.data.ExportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Export 컨트롤러 (Step 6)
 *
 * - 전체 데이터 조회 (클러스터명 포함)
 * - 병합된 클러스터 목록 조회
 * - 클러스터별 상세 데이터 조회
 * - Excel 내보내기 (개별/전체)
 * - 세션 완료 처리
 */
@RestController
@RequestMapping("/api/projects/{projectId}/sessions/{sessionId}/export")
@RequiredArgsConstructor
@Slf4j
public class ExportController {

    private final ExportService exportService;

    /**
     * 전체 데이터 조회 (클러스터명 + 세부클러스터명 포함)
     * - 모든 session_data를 조회하되, 클러스터 정보를 매핑
     */
    @GetMapping("/all-data")
    public ResponseEntity<Map<String, Object>> getAllDataWithClusterInfo(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {
        log.info("전체 데이터 조회: projectId={}, sessionId={}, page={}, size={}",
                projectId, sessionId, page, size);
        return ResponseEntity.ok(exportService.getAllDataWithClusterInfo(sessionId, page, size));
    }

    /**
     * 병합된 클러스터 목록 조회 (Clustering 결과 탭용)
     * - 병합된 클러스터 + 세부 클러스터 정보 포함
     */
    @GetMapping("/merged-clusters")
    public ResponseEntity<List<Map<String, Object>>> getMergedClustersWithSubClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId) {
        log.info("병합된 클러스터 조회: projectId={}, sessionId={}", projectId, sessionId);
        return ResponseEntity.ok(exportService.getMergedClustersWithSubClusters(sessionId));
    }

    /**
     * 클러스터별 상세 데이터 조회 (자세히 버튼 클릭 시)
     * - 해당 클러스터에 소속된 raw_data만 조회
     */
    @GetMapping("/cluster/{clusterNumber}/data")
    public ResponseEntity<Map<String, Object>> getClusterDetailData(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @PathVariable Integer clusterNumber,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {
        log.info("클러스터 상세 데이터 조회: sessionId={}, clusterNumber={}, page={}, size={}",
                sessionId, clusterNumber, page, size);
        return ResponseEntity.ok(exportService.getClusterDetailData(sessionId, clusterNumber, page, size));
    }

    /**
     * 클러스터명 수정
     */
    @PutMapping("/cluster/{clusterNumber}/name")
    public ResponseEntity<Map<String, Object>> updateClusterName(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @PathVariable Integer clusterNumber,
            @RequestBody Map<String, String> request) {
        String newName = request.get("clusterName");
        log.info("클러스터명 수정: sessionId={}, clusterNumber={}, newName={}",
                sessionId, clusterNumber, newName);
        exportService.updateClusterName(sessionId, clusterNumber, newName);
        return ResponseEntity.ok(Map.of("success", true, "clusterNumber", clusterNumber, "clusterName", newName));
    }

    /**
     * 제거열 목록 조회 (컬럼 가시성 설정용)
     */
    @GetMapping("/columns")
    public ResponseEntity<List<Map<String, Object>>> getColumnSettings(
            @PathVariable String projectId,
            @PathVariable String sessionId) {
        log.info("컬럼 설정 조회: projectId={}, sessionId={}", projectId, sessionId);
        return ResponseEntity.ok(exportService.getColumnSettings(sessionId));
    }

    /**
     * 제거열 설정 업데이트
     */
    @PutMapping("/columns")
    public ResponseEntity<Map<String, Object>> updateColumnSettings(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody List<Map<String, Object>> columns) {
        log.info("컬럼 설정 업데이트: projectId={}, sessionId={}, columns={}", projectId, sessionId, columns.size());
        exportService.updateColumnSettings(sessionId, columns);
        return ResponseEntity.ok(Map.of("success", true));
    }

    /**
     * 개별 클러스터 Excel 내보내기 (선택된 클러스터만)
     */
    @PostMapping("/export/selected")
    public ResponseEntity<ExportService.ExportResult> exportSelectedClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<Integer> clusterNumbers = (List<Integer>) request.get("clusterNumbers");
        log.info("개별 클러스터 Export: sessionId={}, clusters={}", sessionId, clusterNumbers);
        try {
            ExportService.ExportResult result = exportService.exportSelectedClusters(sessionId, projectId, clusterNumbers);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Export 실패", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * 전체 클러스터 Excel 내보내기
     */
    @PostMapping("/export/all")
    public ResponseEntity<ExportService.ExportResult> exportAllClusters(
            @PathVariable String projectId,
            @PathVariable String sessionId) {
        log.info("전체 클러스터 Export: sessionId={}", sessionId);
        try {
            ExportService.ExportResult result = exportService.exportAllClusters(sessionId, projectId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Export 실패", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * 기존 Export 파일 다운로드 URL 조회
     */
    @GetMapping("/download-url")
    public ResponseEntity<Map<String, Object>> getExportDownloadUrl(
            @PathVariable String projectId,
            @PathVariable String sessionId) {
        log.info("Export 다운로드 URL 조회: sessionId={}", sessionId);
        Map<String, Object> result = exportService.getExportDownloadUrl(sessionId);
        return ResponseEntity.ok(result);
    }

    /**
     * 세션 완료 처리 (비동기 → taskId 반환)
     *
     * mode 파라미터:
     * - "default" 또는 미지정: 기존 방식 (전체 비동기, 프로그레스 폴링)
     * - "excel_first": 엑셀 먼저 생성 후 downloadUrl 즉시 반환, 통계/DB는 비동기
     */
    @PostMapping("/complete")
    public ResponseEntity<Map<String, Object>> completeSession(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody(required = false) Map<String, Object> request) {
        boolean forceExport = request != null && Boolean.TRUE.equals(request.get("forceExport"));
        String mode = request != null ? String.valueOf(request.getOrDefault("mode", "default")) : "default";

        log.info("세션 완료: sessionId={}, forceExport={}, mode={}", sessionId, forceExport, mode);
        try {
            Map<String, Object> result;
            if ("fire_and_forget".equals(mode)) {
                // ★ 즉시 반환 모드: 모든 작업 비동기, MongoDB 진행률 추적
                result = exportService.completeSessionFullyAsync(sessionId, projectId, forceExport);
            } else if ("excel_first".equals(mode)) {
                // ★ Phase 3: 엑셀 우선 반환 모드
                result = exportService.completeSessionExcelFirst(sessionId, projectId, forceExport);
            } else {
                // 기존 방식: 전체 비동기
                result = exportService.completeSessionAsync(sessionId, projectId, forceExport);
            }
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("세션 완료 시작 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 세션 완료 진행률 조회
     */
    @GetMapping("/complete/progress/{taskId}")
    public ResponseEntity<Map<String, Object>> getCompleteProgress(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @PathVariable String taskId) {
        return ResponseEntity.ok(exportService.getCompleteProgress(taskId, sessionId));
    }

    /**
     * 세션 완료 활성 여부 확인
     */
    @GetMapping("/complete/active")
    public ResponseEntity<Map<String, Object>> isCompleteActive(
            @PathVariable String projectId,
            @PathVariable String sessionId) {
        return ResponseEntity.ok(exportService.isCompleteActive(sessionId));
    }
}
