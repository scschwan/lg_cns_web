package com.example.finance.exception;

/**
 * 이미 프로젝트 멤버인 경우 예외
 */
public class AlreadyMemberException extends RuntimeException {
    public AlreadyMemberException(String message) {
        super(message);
    }
}