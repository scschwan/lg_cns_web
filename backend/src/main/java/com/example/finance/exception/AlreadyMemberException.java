package com.example.finance.exception;

/**
 * 이미 프로젝트 멤버인 사용자를 다시 추가하려 할 때 발생하는 예외
 *
 * <p>GlobalExceptionHandler에서 409 Conflict 응답으로 변환된다.</p>
 */
public class AlreadyMemberException extends RuntimeException {

    /**
     * @param message 예외 메시지 (예: "이미 프로젝트 멤버입니다.")
     */
    public AlreadyMemberException(String message) {
        super(message);
    }
}