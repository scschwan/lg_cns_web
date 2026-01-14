// frontend/src/services/mockDataService.js

/**
 * Mock 데이터 서비스
 * 서버 연동 전 UI 테스트용 더미 데이터 제공
 * 
 * 추후 실제 API 연동 시 각 화면별 서비스로 분리 예정:
 * - fileLoadService.js
 * - preprocessingService.js
 * - dataTransformService.js
 * - clusteringService.js
 * - exportService.js
 */

// ============================================
// FileLoad 화면 더미 데이터
// ============================================
export const getFileLoadData = () => {
    const rawData = [];
    const processData = [];

    for (let i = 1; i <= 100; i++) {
        rawData.push({
            id: i,
            날짜: `2025-01-${String(i % 28 + 1).padStart(2, '0')}`,
            세목: `세목_${i % 10}`,
            코스트센터: `CC_${1000 + i}`,
            공급업체: `공급업체_${i % 20}`,
            금액: Math.floor(Math.random() * 10000000) + 100000,
            적요: `테스트 적요 내용 ${i}`,
        });

        processData.push({
            id: i,
            날짜: `2025-01-${String(i % 28 + 1).padStart(2, '0')}`,
            세목: `세목_${i % 10}`,
            코스트센터_정제: `정제_CC_${1000 + i}`,
            공급업체_정제: `정제_공급업체_${i % 20}`,
            금액: Math.floor(Math.random() * 10000000) + 100000,
            //키워드: `키워드_${i % 5}`,
            적요: `테스트 적요 내용 ${i}`,
        });
    }

    return {
        rawData,
        processData,
        totalRows: 15000,
        columns: ['날짜', '세목', '코스트센터', '공급업체', '금액', '적요'],
    };
};

export const getDeleteColumnList = () => [
    { id: 1, columnName: '날짜', selected: true },
    { id: 2, columnName: '세목', selected: true },
    { id: 3, columnName: '코스트센터', selected: true },
    { id: 4, columnName: '공급업체', selected: true },
    { id: 5, columnName: '금액', selected: true },
    { id: 6, columnName: '적요', selected: false },
    { id: 7, columnName: '비고', selected: false },
];

export const getStandardList = () => [
    { id: 1, original: '(주)삼성전자', standard: '삼성전자' },
    { id: 2, original: '삼성전자(주)', standard: '삼성전자' },
    { id: 3, original: 'LG전자 주식회사', standard: 'LG전자' },
];

// ============================================
// Preprocessing 화면 더미 데이터
// ============================================
export const getPreprocessingData = () => {
    const targetData = [];
    const appliedData = [];

    for (let i = 1; i <= 50; i++) {
        targetData.push({
            id: i,
            원본텍스트: `원본 텍스트 데이터 ${i} - 테스트/구분자|포함`,
            키워드: `키워드_${i % 10}`,
        });

        appliedData.push({
            id: i,
            변환텍스트: `변환 텍스트 데이터 ${i}`,
            추출키워드: `추출_${i % 10}`,
        });
    }

    return { targetData, appliedData };
};

export const getSeparatorList = () => [
    { id: 1, separator: '/', description: '슬래시' },
    { id: 2, separator: '|', description: '파이프' },
    { id: 3, separator: '-', description: '대시' },
];

export const getStopwordList = () => [
    { id: 1, stopword: '주식회사' },
    { id: 2, stopword: '(주)' },
    { id: 3, stopword: 'Co.' },
    { id: 4, stopword: 'Ltd.' },
];

// ============================================
// DataTransform 화면 더미 데이터
// ============================================
export const getDataTransformData = () => {
    const originalData = [];
    const transformData = [];

    for (let i = 1; i <= 50; i++) {
        originalData.push({
            id: i,
            키워드: `키워드_${i % 15}`,
            건수: Math.floor(Math.random() * 100) + 1,
            금액합계: Math.floor(Math.random() * 50000000) + 1000000,
        });

        transformData.push({
            id: i,
            변환키워드: `변환_키워드_${i % 15}`,
            건수: Math.floor(Math.random() * 100) + 1,
            금액합계: Math.floor(Math.random() * 50000000) + 1000000,
        });
    }

    return { originalData, transformData };
};

export const getKeywordSummary = () => [
    { id: 1, keyword: '인건비', count: 150, amount: 500000000 },
    { id: 2, keyword: '재료비', count: 80, amount: 320000000 },
    { id: 3, keyword: '외주비', count: 45, amount: 180000000 },
    { id: 4, keyword: '경비', count: 200, amount: 120000000 },
    { id: 5, keyword: '기타', count: 30, amount: 50000000 },
];

export const getMatchKeywords = () => [
    { id: 1, keyword: '인건비', matchKeyword: '급여', selected: false },
    { id: 2, keyword: '재료비', matchKeyword: '원자재', selected: false },
    { id: 3, keyword: '외주비', matchKeyword: '용역비', selected: false },
];

// ============================================
// Clustering 화면 더미 데이터
// ============================================
export const getClusteringData = () => {
    const mergeClusterData = [];
    const modifiedData = [];

    for (let i = 1; i <= 30; i++) {
        mergeClusterData.push({
            id: i,
            clusterId: i,
            clusterName: `클러스터_${i}`,
            keywordCount: Math.floor(Math.random() * 50) + 5,
            totalAmount: Math.floor(Math.random() * 100000000) + 1000000,
            merged: false,
        });
    }

    for (let i = 1; i <= 100; i++) {
        modifiedData.push({
            id: i,
            키워드: `키워드_${i % 30}`,
            코스트센터: `CC_${1000 + (i % 10)}`,
            공급업체: `공급업체_${i % 20}`,
            금액: Math.floor(Math.random() * 10000000) + 100000,
            clusterId: (i % 30) + 1,
        });
    }

    return { mergeClusterData, modifiedData };
};

export const getClusterSummary = () => ({
    totalRows: 15000,
    unmergedClusters: 25,
    unmergedAmount: 450000000,
});

export const getSupplierSummary = () => [
    { id: 1, supplier: '삼성전자', count: 50, amount: 80000000 },
    { id: 2, supplier: 'LG전자', count: 35, amount: 55000000 },
    { id: 3, supplier: 'SK하이닉스', count: 28, amount: 42000000 },
];

export const getRecommendKeywords = () => [
    { id: 1, keyword: '반도체', score: 0.95 },
    { id: 2, keyword: '디스플레이', score: 0.88 },
    { id: 3, keyword: '전자부품', score: 0.82 },
];

export const getLv1List = () => [
    { id: 1, lv1Name: '제조원가', selected: false },
    { id: 2, lv1Name: '판매관리비', selected: false },
    { id: 3, lv1Name: '연구개발비', selected: false },
];

// ============================================
// Export (Classification) 화면 더미 데이터
// ============================================
export const getExportData = () => {
    const originData = [];
    const keywordData = [];

    for (let i = 1; i <= 50; i++) {
        originData.push({
            id: i,
            날짜: `2025-01-${String(i % 28 + 1).padStart(2, '0')}`,
            세목: `세목_${i % 10}`,
            코스트센터: `CC_${1000 + i}`,
            공급업체: `공급업체_${i % 20}`,
            금액: Math.floor(Math.random() * 10000000) + 100000,
            클러스터명: `클러스터_${i % 5}`,
        });

        keywordData.push({
            id: i,
            키워드: `키워드_${i % 15}`,
            건수: Math.floor(Math.random() * 100) + 1,
            금액합계: Math.floor(Math.random() * 50000000) + 1000000,
            클러스터명: `클러스터_${i % 5}`,
        });
    }

    return { originData, keywordData };
};

export const getClusteringResults = () => [
    { id: 1, clusterId: 1, clusterName: '인건비 관련', recordCount: 1500, totalAmount: 500000000 },
    { id: 2, clusterId: 2, clusterName: '재료비 관련', recordCount: 800, totalAmount: 320000000 },
    { id: 3, clusterId: 3, clusterName: '외주비 관련', recordCount: 450, totalAmount: 180000000 },
    { id: 4, clusterId: 4, clusterName: '경비 관련', recordCount: 2000, totalAmount: 120000000 },
    { id: 5, clusterId: 5, clusterName: '기타', recordCount: 300, totalAmount: 50000000 },
];

export const getExportColumnList = () => [
    { id: 1, columnName: '날짜', selected: true },
    { id: 2, columnName: '세목', selected: true },
    { id: 3, columnName: '코스트센터', selected: true },
    { id: 4, columnName: '공급업체', selected: true },
    { id: 5, columnName: '금액', selected: true },
    { id: 6, columnName: '클러스터명', selected: true },
    { id: 7, columnName: '적요', selected: false },
];

// ============================================
// 공통 유틸
// ============================================
export const getSessionInfo = () => ({
    sessionId: 'session-demo-001',
    sessionName: '2025년 1월 재무데이터 분석',
    projectId: 'project-demo-001',
    projectName: 'LG CNS 비용분석 프로젝트',
    createdAt: '2025-01-15T09:00:00Z',
    status: 'IN_PROGRESS',
});

export default {
    getFileLoadData,
    getDeleteColumnList,
    getStandardList,
    getPreprocessingData,
    getSeparatorList,
    getStopwordList,
    getDataTransformData,
    getKeywordSummary,
    getMatchKeywords,
    getClusteringData,
    getClusterSummary,
    getSupplierSummary,
    getRecommendKeywords,
    getLv1List,
    getExportData,
    getClusteringResults,
    getExportColumnList,
    getSessionInfo,
};
