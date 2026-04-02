package com.example.finance.controller.data;

import com.example.finance.model.data.PreprocessingConfigDocument.ConfigItem;
import com.example.finance.model.data.UserPreprocessingConfigDocument;
import com.example.finance.security.CurrentUser;
import com.example.finance.security.UserPrincipal;
import com.example.finance.service.data.PreprocessingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 사용자 레벨 전처리 설정 컨트롤러
 *
 * 세션과 무관하게 사용자별 구분자/불용어 기본 설정을 관리한다.
 * 새 세션 생성 시 이 설정이 기본값으로 적용된다.
 */
@Slf4j
@RestController
@RequestMapping("/api/preprocessing")
@RequiredArgsConstructor
public class UserPreprocessingConfigController {

    private final PreprocessingService preprocessingService;

    /**
     * 사용자 레벨 구분자/불용어 설정 조회
     */
    @GetMapping("/user-config")
    public ResponseEntity<?> getUserConfig(@CurrentUser UserPrincipal userPrincipal) {
        UserPreprocessingConfigDocument config = preprocessingService.getUserConfig(userPrincipal.getId());
        if (config == null) {
            return ResponseEntity.ok(Map.of("exists", false));
        }
        return ResponseEntity.ok(config);
    }

    /**
     * 사용자 레벨 구분자/불용어 설정 저장
     */
    @PutMapping("/user-config")
    public ResponseEntity<UserPreprocessingConfigDocument> saveUserConfig(
            @RequestBody Map<String, Object> body,
            @CurrentUser UserPrincipal userPrincipal) {

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

        return ResponseEntity.ok(preprocessingService.saveUserConfig(userPrincipal.getId(), separators, stopwords));
    }
}
