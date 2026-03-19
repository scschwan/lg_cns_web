package com.example.finance.exception;

/**
 * 로그인 시 이메일 또는 비밀번호가 일치하지 않을 때 발생하는 예외
 *
 * <p>GlobalExceptionHandler에서 401 Unauthorized 응답으로 변환된다.</p>
 */
public class InvalidCredentialsException extends RuntimeException {

    /**
     * @param message 예외 메시지 (예: "이메일 또는 비밀번호가 올바르지 않습니다.")
     */
    public InvalidCredentialsException(String message) {
        super(message);
    }
}