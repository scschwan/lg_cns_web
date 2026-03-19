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
 *   - /api/system/**                      (시스템 상태 조회)
 *   - /api/admin/**                       (관리자 페이지 전체)
 *   - /api/auth/**                        (인증)
 *   - /api/health/**                      (DB 헬스체크)
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
            "/api/system/",
            "/api/admin/",
            "/api/auth/",
            "/api/health",
            "/actuator/health"
    );

    /**
     * 유지보수 모드 여부를 확인하고, 활성 시 일반 API 요청을 차단한다
     *
     * <p>처리 흐름:</p>
     * <ol>
     *   <li>OPTIONS(preflight) 요청은 항상 통과</li>
     *   <li>허용 경로(관리자, 인증, 헬스체크 등)는 항상 통과</li>
     *   <li>유지보수 모드 활성 시 503 응답 반환</li>
     *   <li>유지보수 상태 조회 실패 시 fail-open 정책으로 요청 허용</li>
     * </ol>
     *
     * @param request  HTTP 요청 객체
     * @param response HTTP 응답 객체
     * @param filterChain 필터 체인
     * @throws ServletException 서블릿 처리 예외
     * @throws IOException 입출력 예외
     */
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

    /**
     * 요청 경로가 유지보수 모드에서도 허용되는 경로인지 확인
     *
     * @param path 요청 URI
     * @return 허용 경로이면 true
     */
    private boolean isAllowedPath(String path) {
        return ALLOWED_PATHS.stream().anyMatch(path::startsWith);
    }

    /**
     * 유지보수 모드 503 응답을 JSON 형식으로 반환
     *
     * @param response HTTP 응답 객체
     * @throws IOException 응답 쓰기 중 예외
     */
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
