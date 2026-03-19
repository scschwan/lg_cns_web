package com.example.finance.enums;

/**
 * 원가 절감 분석 단계를 정의하는 열거형
 *
 * <p>원가 절감 항목이 최초 식별부터 최종 관리 완료까지 거치는
 * 5단계 워크플로우를 나타낸다.</p>
 */
public enum CostReductionPhase {

    /** 1단계: 롱 리스트 - 절감 가능 항목 초기 식별 및 수집 */
    LONG_LIST,

    /** 2단계: 숏 리스트 - 실행 가능성 평가 후 선별된 항목 목록 */
    SHORT_LIST,

    /** 3단계: 실행 등록 - 절감 실행 항목으로 공식 등록 */
    ABLE_REGISTER,

    /** 4단계: 실행 관리 - 절감 활동 진행 및 모니터링 */
    ABLE_MANAGE,

    /** 5단계: 완료 관리 - 절감 활동 완료 후 성과 관리 */
    COMPLETED_MANAGE
}
