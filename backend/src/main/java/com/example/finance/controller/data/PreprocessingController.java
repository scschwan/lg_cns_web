package com.example.finance.controller.data;

import com.example.finance.model.data.PreprocessingConfigDocument;
import com.example.finance.model.data.PreprocessingConfigDocument.ConfigItem;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.data.PreprocessingService;
import com.example.finance.service.project.ProjectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 전처리 컨트롤러 (Step 3: Preprocessing)
 *
 * Base path: /api/projects/{projectId}/sessions/{sessionId}/preprocessing
 */
@Slf4j
@RestController
@RequestMapping("/api/projects/{projectId}/sessions/{sessionId}/preprocessing")
@RequiredArgsConstructor
public class PreprocessingController {

    private final PreprocessingService preprocessingService;
    private final ProjectService projectService;

    /**
     * 세션 정보 조회 (필수항목 매핑 포함)
     */
    @GetMapping("/session-info")
    public ResponseEntity<Map<String, Object>> getSessionInfo(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(preprocessingService.getSessionInfo(sessionId));
    }

    /**
     * process_data 페이징 조회 (타겟 + 결과 테이블)
     */
    @GetMapping("/data")
    public ResponseEntity<Map<String, Object>> getProcessData(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(preprocessingService.getProcessData(sessionId, page, size));
    }

    /**
     * 구분자/불용어 설정 조회
     */
    @GetMapping("/config")
    public ResponseEntity<PreprocessingConfigDocument> getConfig(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(preprocessingService.getOrCreateConfig(sessionId, userPrincipal.getId()));
    }

    /**
     * 구분자/불용어 설정 저장
     */
    @PutMapping("/config")
    public ResponseEntity<PreprocessingConfigDocument> saveConfig(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> separatorMaps = (List<Map<String, Object>>) body.get("separators");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> stopwordMaps = (List<Map<String, Object>>) body.get("stopwords");

        List<ConfigItem> separators = null;
        List<ConfigItem> stopwords = null;

        if (separatorMaps != null) {
            separators = separatorMaps.stream()
                    .map(m -> ConfigItem.builder()
                            .value((String) m.get("value"))
                            .checked((Boolean) m.get("checked"))
                            .build())
                    .toList();
        }
        if (stopwordMaps != null) {
            stopwords = stopwordMaps.stream()
                    .map(m -> ConfigItem.builder()
                            .value((String) m.get("value"))
                            .checked((Boolean) m.get("checked"))
                            .build())
                    .toList();
        }

        return ResponseEntity.ok(preprocessingService.saveConfig(sessionId, separators, stopwords));
    }

    /**
     * 키워드 추출 진행 상태 조회 (Redis 폴링)
     * @param type "separator" 또는 "nlp"
     */
    @GetMapping("/extract-progress")
    public ResponseEntity<Map<String, Object>> getExtractProgress(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "separator") String type,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(preprocessingService.getExtractProgress(sessionId, type));
    }

    /**
     * 키워드 추출 (구분자 기반)
     */
    @PostMapping("/extract-keywords")
    public ResponseEntity<Map<String, Object>> extractKeywords(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(preprocessingService.extractKeywords(sessionId));
    }

    /**
     * 1글자 제거
     */
    @PostMapping("/remove-single-char")
    public ResponseEntity<Map<String, Object>> removeSingleChar(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        return ResponseEntity.ok(preprocessingService.removeSingleCharKeywords(sessionId));
    }

    /**
     * NLP 기반 키워드 추출 (형태소 분석)
     */
    @PostMapping("/extract-keywords-nlp")
    public ResponseEntity<Map<String, Object>> extractKeywordsNlp(
            @PathVariable String projectId,
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

        projectService.getProject(projectId, userPrincipal.getId());
        int minKeywordLength = 4;
        if (body != null && body.get("minKeywordLength") != null) {
            minKeywordLength = ((Number) body.get("minKeywordLength")).intValue();
        }
        return ResponseEntity.ok(preprocessingService.extractKeywordsNlp(sessionId, minKeywordLength));
    }
}
