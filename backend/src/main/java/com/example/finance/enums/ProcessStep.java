package com.example.finance.enums;

/**
 * 프로세스 단계 정의
 *
 * 각 단계의 순서, 이름, API 경로를 중앙에서 관리
 */
public enum ProcessStep {
    UPLOAD(1, "Multi File Upload", "/api/upload", "파일 업로드 및 세션 관리"),
    FILE_LOAD(2, "File Load", "/api/fileload", "Excel 파싱 및 데이터 로드"),
    PREPROCESSING(3, "Preprocessing", "/api/preprocessing", "데이터 전처리 및 검증"),
    TRANSFORM(4, "Data Transform", "/api/transform", "데이터 집계 및 변환"),
    CLUSTERING(5, "Clustering", "/api/clustering", "K-Means 클러스터링"),
    EXPORT(6, "Export", "/api/export", "Excel 내보내기 및 세션 완료"),
    DETAIL_CLUSTERING(7, "Detail Clustering", "/api/detailclustering", "세부 클러스터링");

    private final int stepNumber;
    private final String displayName;
    private final String apiPath;
    private final String description;

    ProcessStep(int stepNumber, String displayName, String apiPath, String description) {
        this.stepNumber = stepNumber;
        this.displayName = displayName;
        this.apiPath = apiPath;
        this.description = description;
    }

    public int getStepNumber() {
        return stepNumber;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getApiPath() {
        return apiPath;
    }

    public String getDescription() {
        return description;
    }

    /**
     * 다음 단계 반환
     * @return 다음 단계, 마지막 단계인 경우 null
     */
    public ProcessStep getNextStep() {
        if (stepNumber < 7) {
            return values()[stepNumber]; // stepNumber는 1-based, values()는 0-based
        }
        return null;
    }

    /**
     * 이전 단계 반환
     * @return 이전 단계, 첫 번째 단계인 경우 null
     */
    public ProcessStep getPreviousStep() {
        if (stepNumber > 1) {
            return values()[stepNumber - 2];
        }
        return null;
    }

    /**
     * stepNumber로 ProcessStep 찾기
     * @param stepNumber 단계 번호 (1-7)
     * @return ProcessStep
     * @throws IllegalArgumentException stepNumber가 유효하지 않은 경우
     */
    public static ProcessStep fromStepNumber(int stepNumber) {
        for (ProcessStep step : values()) {
            if (step.stepNumber == stepNumber) {
                return step;
            }
        }
        throw new IllegalArgumentException("Invalid step number: " + stepNumber);
    }

    /**
     * API 경로로 ProcessStep 찾기
     * @param apiPath API 경로
     * @return ProcessStep
     * @throws IllegalArgumentException apiPath가 유효하지 않은 경우
     */
    public static ProcessStep fromApiPath(String apiPath) {
        for (ProcessStep step : values()) {
            if (step.apiPath.equals(apiPath)) {
                return step;
            }
        }
        throw new IllegalArgumentException("Invalid API path: " + apiPath);
    }
}