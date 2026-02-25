package com.example.finance.config;

import com.example.finance.service.admin.MaintenanceService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 유지보수 모드 필터
 *
 * 유지보수 모드 활성 시 일반 API 요청을 503으로 차단.
 * 아래 경로는 유지보수 중에도 허용:
 *   - GET /api/system/maintenance-status  (상태 조회)
 *   - GET /api/system/upload-progress     (진행률 조회)
 *   - /api/auth/**                        (인증)
 *   - POST /api/admin/maintenance-mode    (관리자 제어)
 *   - /actuator/health                    (헬스체크)
 */
@Slf4j
@Component
@Order(10)
@RequiredArgsConstructor
public class MaintenanceFilter extends OncePerRequestFilter {

    private final MaintenanceService maintenanceService;
    private final ObjectMapper objectMapper;

    /**
     * 유지보수 모드 중에도 허용되는 경로 목록
     */
    private static final List<String> ALLOWED_PATHS = Arrays.asList(
            "/api/system/maintenance-status",
            "/api/system/upload-progress",
            "/api/admin/maintenance-mode",
            "/api/auth/",
            "/actuator/health"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String path = request.getRequestURI();
        String method = request.getMethod();

        // OPTIONS (preflight) 는 항상 허용
        if ("OPTIONS".equalsIgnoreCase(method)) {
            filterChain.doFilter(request, response);
            return;
        }

        // 허용 경로인지 확인
        if (isAllowedPath(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        // 유지보수 모드 체크 (DB 조회 - 성능 최적화 필요 시 캐싱 고려)
        try {
            if (maintenanceService.isMaintenanceActive()) {
                log.info("[MAINTENANCE] 서비스 차단: method={}, path={}", method, path);
                sendMaintenanceResponse(response);
                return;
            }
        } catch (Exception e) {
            // 유지보수 상태 조회 실패 시 서비스는 계속 허용 (fail-open)
            log.warn("[MAINTENANCE] 유지보수 상태 조회 실패, 요청 허용: {}", e.getMessage());
        }

        filterChain.doFilter(request, response);
    }

    private boolean isAllowedPath(String path) {
        return ALLOWED_PATHS.stream().anyMatch(path::startsWith);
    }

    private void sendMaintenanceResponse(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.SERVICE_UNAVAILABLE.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");

        Map<String, Object> body = Map.of(
                "error", "SERVICE_UNAVAILABLE",
                "message", "현재 서비스 점검 중입니다. 잠시 후 다시 시도해 주세요.",
                "status", 503
        );

        response.getWriter().write(objectMapper.writeValueAsString(body));
    }
}
