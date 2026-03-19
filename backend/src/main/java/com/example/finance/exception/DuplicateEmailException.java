package com.example.finance.exception;

/**
 * 회원가입 시 이미 존재하는 이메일로 가입을 시도할 때 발생하는 예외
 *
 * <p>GlobalExceptionHandler에서 409 Conflict 응답으로 변환된다.</p>
 */
public class DuplicateEmailException extends RuntimeException {

    /**
     * @param message 예외 메시지 (예: "이미 사용 중인 이메일입니다.")
     */
    public DuplicateEmailException(String message) {
        super(message);
    }
}