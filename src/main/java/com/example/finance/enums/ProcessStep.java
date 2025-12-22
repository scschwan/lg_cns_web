package com.example.finance.enums;

/**
 * 프로세스 단계 Enum
 */
public enum ProcessStep {
    FILE_LOAD("FileLoad", "파일 로드"),
    PREPROCESSING("Preprocessing", "데이터 전처리"),
    DATA_TRANSFORM("DataTransform", "데이터 변환"),
    CLUSTERING("Clustering", "클러스터링"),
    EXPORT("Export", "결과 내보내기"),
    DETAIL_CLUSTERING("DetailClustering", "세부 클러스터링");

    private final String code;
    private final String description;

    ProcessStep(String code, String description) {
        this.code = code;
        this.description = description;
    }

    public String getCode() {
        return code;
    }

    public String getDescription() {
        return description;
    }
}