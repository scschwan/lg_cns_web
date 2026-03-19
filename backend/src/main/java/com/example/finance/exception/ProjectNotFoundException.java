package com.example.finance.exception;

/**
 * 지정된 ID의 프로젝트가 존재하지 않을 때 발생하는 예외
 *
 * <p>GlobalExceptionHandler에서 404 Not Found 응답으로 변환된다.</p>
 */
public class ProjectNotFoundException extends RuntimeException {

    /**
     * @param message 예외 메시지 (예: "프로젝트를 찾을 수 없습니다: {id}")
     */
    public ProjectNotFoundException(String message) {
        super(message);
    }
}