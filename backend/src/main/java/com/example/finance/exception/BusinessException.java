package com.example.finance.exception;

import lombok.Getter;

/**
 * 비즈니스 로직 예외 기본 클래스
 *
 * <p>비즈니스 규칙 위반 시 발생하는 예외로, 에러 코드와 메시지를 함께 전달한다.
 * GlobalExceptionHandler에서 400 Bad Request 응답으로 변환된다.</p>
 *
 * <p>사용 예시:</p>
 * <pre>
 *   throw new BusinessException("INVALID_AMOUNT", "금액은 0보다 커야 합니다.");
 * </pre>
 *
 * @see GlobalExceptionHandler#handleBusinessException(BusinessException) 예외 처리
 */
@Getter
public class BusinessException extends RuntimeException {

    /** 에러 코드 (프론트엔드에서 에러 유형을 식별하는 데 사용) */
    private final String errorCode;

    /**
     * 에러 코드와 메시지로 예외를 생성한다
     *
     * @param errorCode 에러 코드 (예: "INVALID_AMOUNT", "SESSION_EXPIRED")
     * @param message   사용자에게 표시할 에러 메시지
     */
    public BusinessException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    /**
     * 에러 코드, 메시지, 원인 예외로 예외를 생성한다
     *
     * @param errorCode 에러 코드
     * @param message   사용자에게 표시할 에러 메시지
     * @param cause     원인 예외
     */
    public BusinessException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }
}