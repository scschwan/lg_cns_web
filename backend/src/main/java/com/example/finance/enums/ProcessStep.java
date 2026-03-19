package com.example.finance.enums;

/**
 * 데이터 처리 프로세스의 각 단계를 정의하는 열거형
 *
 * <p>파일 업로드부터 최종 내보내기까지 7단계의 데이터 분석 파이프라인을
 * 나타내며, 각 단계의 순서 번호, 표시명, API 경로, 설명을 중앙에서 관리한다.</p>
 *
 * <p>단계 흐름:</p>
 * <ol>
 *   <li>UPLOAD - 파일 업로드 및 세션 관리</li>
 *   <li>START_ANALYSIS - 계정 분석 시작 (Lambda 비동기 처리)</li>
 *   <li>PREPROCESSING - 데이터 전처리 및 검증</li>
 *   <li>TRANSFORM - 데이터 집계 및 변환</li>
 *   <li>CLUSTERING - K-Means 클러스터링</li>
 *   <li>EXPORT - Excel 내보내기 및 세션 완료</li>
 *   <li>DETAIL_CLUSTERING - 세부 클러스터링</li>
 * </ol>
 */
public enum ProcessStep {
    UPLOAD(1, "Multi File Upload", "/api/upload", "파일 업로드 및 세션 관리"),
    //FILE_LOAD(2, "File Load", "/api/fileload", "Excel 파싱 및 데이터 로드"),
    START_ANALYSIS(2, "Start Analysis", "/api/startanalysis", "계정 분석 시작"),
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