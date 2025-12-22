package com.example.finance.exception;

/**
 * 사용자를 찾을 수 없음 예외
 */
public class UserNotFoundException extends RuntimeException {
    public UserNotFoundException(String message) {
        super(message);
    }
}