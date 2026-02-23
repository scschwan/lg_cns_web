package com.example.finance.controller.costreduction;

import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.costreduction.ClusteringImportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/**
 * 클러스터링 엑셀 Import 컨트롤러
 *
 * 이미 클러스터링이 완료된 엑셀 파일을 업로드하여
 * 대시보드(Long List / Short List)에 직접 데이터를 반영한다.
 *
 * Base Path: /api/projects/{projectId}/dashboard/import
 */
@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/dashboard/import")
@RequiredArgsConstructor
public class ClusteringImportController {

    private final ClusteringImportService clusteringImportService;

    /**
     * 클러스터링 엑셀 Import
     *
     * POST /api/projects/{projectId}/dashboard/import/process
     *
     * @param file             엑셀 파일 (multipart)
     * @param accountName      계정명 (직접 입력)
     * @param clusterColumn    클러스터명 컬럼명
     * @param subClusterColumn 세부클러스터명 컬럼명 (선택)
     * @param supplierColumn   공급업체 컬럼명 (선택)
     * @param costCenterColumn 코스트센터 컬럼명 (선택)
     * @param amountColumn     금액 컬럼명
     */
    @PostMapping("/process")
    public ResponseEntity<Map<String, Object>> importClusteringExcel(
            @PathVariable String projectId,
            @CurrentUser UserPrincipal userPrincipal,
            @RequestParam("file") MultipartFile file,
            @RequestParam("accountName") String accountName,
            @RequestParam("clusterColumn") String clusterColumn,
            @RequestParam(value = "subClusterColumn", required = false) String subClusterColumn,
            @RequestParam(value = "supplierColumn", required = false) String supplierColumn,
            @RequestParam(value = "costCenterColumn", required = false) String costCenterColumn,
            @RequestParam("amountColumn") String amountColumn) {

        log.info("클러스터링 엑셀 Import 요청: projectId={}, userId={}, fileName={}",
                projectId, userPrincipal.getId(), file.getOriginalFilename());

        Map<String, Object> result = clusteringImportService.importClusteringExcel(
                projectId,
                userPrincipal.getId(),
                file,
                accountName,
                clusterColumn,
                subClusterColumn,
                supplierColumn,
                costCenterColumn,
                amountColumn);

        return ResponseEntity.ok(result);
    }
}
