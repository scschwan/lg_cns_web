package com.example.finance.exception;

/**
 * 인증 정보 오류 예외
 */
public class InvalidCredentialsException extends RuntimeException {
    public InvalidCredentialsException(String message) {
        super(message);
    }
}