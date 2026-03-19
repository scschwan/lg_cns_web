package com.example.finance.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 전역 예외 처리 핸들러
 *
 * <p>컨트롤러에서 발생하는 모든 예외를 중앙에서 처리하여
 * 일관된 JSON 형식의 에러 응답을 반환한다.</p>
 *
 * <p>처리하는 예외 유형:</p>
 * <ul>
 *   <li>DuplicateEmailException: 이메일 중복 (409 Conflict)</li>
 *   <li>InvalidCredentialsException: 인증 실패 (401 Unauthorized)</li>
 *   <li>UserNotFoundException: 사용자 미존재 (404 Not Found)</li>
 *   <li>ProjectNotFoundException: 프로젝트 미존재 (404 Not Found)</li>
 *   <li>AlreadyMemberException: 이미 멤버 (409 Conflict)</li>
 *   <li>BusinessException: 비즈니스 로직 예외 (400 Bad Request)</li>
 *   <li>MethodArgumentNotValidException: 입력값 검증 실패 (400 Bad Request)</li>
 *   <li>HttpMessageNotReadableException: JSON 파싱 오류 (400 Bad Request)</li>
 *   <li>Exception: 기타 예상치 못한 오류 (500 Internal Server Error)</li>
 * </ul>
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 이메일 중복 예외 처리
     *
     * @param e 이메일 중복 예외
     * @return 409 Conflict 응답
     */
    @ExceptionHandler(DuplicateEmailException.class)
    public ResponseEntity<Map<String, Object>> handleDuplicateEmail(DuplicateEmailException e) {
        return createErrorResponse(HttpStatus.CONFLICT, e.getMessage());
    }

    /**
     * 인증 정보 오류 예외 처리 (비밀번호 불일치 등)
     *
     * @param e 인증 오류 예외
     * @return 401 Unauthorized 응답
     */
    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<Map<String, Object>> handleInvalidCredentials(InvalidCredentialsException e) {
        return createErrorResponse(HttpStatus.UNAUTHORIZED, e.getMessage());
    }

    /**
     * 사용자 미존재 예외 처리
     *
     * @param e 사용자 미존재 예외
     * @return 404 Not Found 응답
     */
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleUserNotFound(UserNotFoundException e) {
        return createErrorResponse(HttpStatus.NOT_FOUND, e.getMessage());
    }

    /**
     * 프로젝트 미존재 예외 처리
     *
     * @param e 프로젝트 미존재 예외
     * @return 404 Not Found 응답
     */
    @ExceptionHandler(ProjectNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleProjectNotFound(ProjectNotFoundException e) {
        return createErrorResponse(HttpStatus.NOT_FOUND, e.getMessage());
    }

    /**
     * 이미 프로젝트 멤버인 경우 예외 처리
     *
     * @param e 이미 멤버 예외
     * @return 409 Conflict 응답
     */
    @ExceptionHandler(AlreadyMemberException.class)
    public ResponseEntity<Map<String, Object>> handleAlreadyMember(AlreadyMemberException e) {
        return createErrorResponse(HttpStatus.CONFLICT, e.getMessage());
    }

    /**
     * 비즈니스 로직 예외 처리
     *
     * <p>비즈니스 규칙 위반 시 에러 코드와 메시지를 포함한 400 응답을 반환한다.</p>
     *
     * @param e 비즈니스 예외 (에러 코드 포함)
     * @return 400 Bad Request 응답
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Map<String, Object>> handleBusinessException(BusinessException e) {
        log.error("Business exception: errorCode={}, message={}",
                e.getErrorCode(), e.getMessage());

        Map<String, Object> response = new HashMap<>();
        response.put("success", false);
        response.put("error", e.getErrorCode());
        response.put("message", e.getMessage());
        response.put("timestamp", LocalDateTime.now());

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
    }

    /**
     * Bean Validation 검증 실패 예외 처리
     *
     * <p>@Valid 어노테이션에 의한 필드 유효성 검증 실패 시
     * 각 필드별 에러 메시지를 포함한 400 응답을 반환한다.</p>
     *
     * @param e 입력값 검증 실패 예외
     * @return 400 Bad Request 응답 (필드별 에러 상세 포함)
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidationErrors(MethodArgumentNotValidException e) {
        Map<String, String> errors = new HashMap<>();
        e.getBindingResult().getAllErrors().forEach(error -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();
            errors.put(fieldName, errorMessage);
        });

        Map<String, Object> response = new HashMap<>();
        response.put("success", false);
        response.put("error", "VALIDATION_ERROR");
        response.put("message", "입력값 검증 실패");
        response.put("errors", errors);
        response.put("timestamp", LocalDateTime.now());

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
    }

    /**
     * 예상치 못한 예외에 대한 최종 폴백 처리
     *
     * @param e 처리되지 않은 예외
     * @return 500 Internal Server Error 응답
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGenericException(Exception e) {
        log.error("예상치 못한 오류", e);
        return createErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다");
    }

    /**
     * 공통 에러 응답 생성 헬퍼 메서드
     *
     * @param status  HTTP 상태 코드
     * @param message 에러 메시지
     * @return 통일된 형식의 에러 응답 (success, error, message, timestamp)
     */
    private ResponseEntity<Map<String, Object>> createErrorResponse(HttpStatus status, String message) {
        Map<String, Object> response = new HashMap<>();
        response.put("success", false);
        response.put("error", status.name());
        response.put("message", message);
        response.put("timestamp", LocalDateTime.now());

        return ResponseEntity.status(status).body(response);
    }

    /**
     * JSON 파싱 오류 예외 처리
     *
     * <p>요청 본문의 JSON이 올바르지 않거나 Enum 값이 매핑되지 않는 경우 등을 처리한다.</p>
     *
     * @param e JSON 파싱 예외
     * @return 400 Bad Request 응답 (상세 원인 포함)
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleJsonErrors(HttpMessageNotReadableException e) {
        log.error("JSON 파싱 오류: {}", e.getMessage()); // 로그 강제 출력

        Map<String, Object> response = new HashMap<>();
        response.put("success", false);
        response.put("error", "BAD_REQUEST");
        response.put("message", "요청 데이터 형식이 올바르지 않습니다. (Enum 값 등을 확인하세요)");
        response.put("details", e.getMessage());
        response.put("timestamp", LocalDateTime.now());

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
    }
}
