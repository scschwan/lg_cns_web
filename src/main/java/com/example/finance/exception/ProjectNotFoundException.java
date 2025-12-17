package com.example.finance.exception;

/**
 * 프로젝트를 찾을 수 없음 예외
 */
public class ProjectNotFoundException extends RuntimeException {
    public ProjectNotFoundException(String message) {
        super(message);
    }
}