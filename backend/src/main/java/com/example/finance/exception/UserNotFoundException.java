package com.example.finance.exception;

/**
 * 지정된 ID 또는 이메일의 사용자가 존재하지 않을 때 발생하는 예외
 *
 * <p>GlobalExceptionHandler에서 404 Not Found 응답으로 변환된다.</p>
 */
public class UserNotFoundException extends RuntimeException {

    /**
     * @param message 예외 메시지 (예: "사용자를 찾을 수 없습니다: {email}")
     */
    public UserNotFoundException(String message) {
        super(message);
    }
}