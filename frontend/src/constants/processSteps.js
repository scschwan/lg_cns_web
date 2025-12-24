// src/constants/processSteps.js

/**
 * 프로세스 단계 정의
 *
 * Backend의 ProcessStep Enum과 동기화 필요
 */
export const PROCESS_STEPS = {
    UPLOAD: {
        step: 1,
        name: 'Multi File Upload',
        path: '/project/:projectId/upload',
        apiPath: '/api/upload',
        description: '파일 업로드 및 세션 관리',
        icon: 'CloudUpload'
    },
    FILE_LOAD: {
        step: 2,
        name: 'File Load',
        path: '/project/:projectId/fileload',
        apiPath: '/api/fileload',
        description: 'Excel 파싱 및 데이터 로드',
        icon: 'FileText'
    },
    PREPROCESSING: {
        step: 3,
        name: 'Preprocessing',
        path: '/project/:projectId/preprocessing',
        apiPath: '/api/preprocessing',
        description: '데이터 전처리 및 검증',
        icon: 'Filter'
    },
    TRANSFORM: {
        step: 4,
        name: 'Data Transform',
        path: '/project/:projectId/transform',
        apiPath: '/api/transform',
        description: '데이터 집계 및 변환',
        icon: 'RefreshCw'
    },
    CLUSTERING: {
        step: 5,
        name: 'Clustering',
        path: '/project/:projectId/clustering',
        apiPath: '/api/clustering',
        description: 'K-Means 클러스터링',
        icon: 'Grid'
    },
    EXPORT: {
        step: 6,
        name: 'Export',
        path: '/project/:projectId/export',
        apiPath: '/api/export',
        description: 'Excel 내보내기 및 세션 완료',
        icon: 'Download'
    },
    DETAIL_CLUSTERING: {
        step: 7,
        name: 'Detail Clustering',
        path: '/project/:projectId/detailclustering',
        apiPath: '/api/detailclustering',
        description: '세부 클러스터링',
        icon: 'ZoomIn'
    }
};

/**
 * 단계 번호로 ProcessStep 찾기
 *
 * @param {number} stepNumber - 단계 번호 (1-7)
 * @returns {Object|undefined} ProcessStep 객체 또는 undefined
 */
export const getStepByNumber = (stepNumber) => {
    return Object.values(PROCESS_STEPS).find(s => s.step === stepNumber);
};

/**
 * 다음 단계 반환
 *
 * @param {Object} currentStep - 현재 단계
 * @returns {Object|null} 다음 단계 또는 null
 */
export const getNextStep = (currentStep) => {
    if (!currentStep || currentStep.step >= 7) {
        return null;
    }
    return getStepByNumber(currentStep.step + 1);
};

/**
 * 이전 단계 반환
 *
 * @param {Object} currentStep - 현재 단계
 * @returns {Object|null} 이전 단계 또는 null
 */
export const getPreviousStep = (currentStep) => {
    if (!currentStep || currentStep.step <= 1) {
        return null;
    }
    return getStepByNumber(currentStep.step - 1);
};

/**
 * 모든 단계를 순서대로 반환
 *
 * @returns {Array} 모든 ProcessStep 배열 (오름차순)
 */
export const getAllSteps = () => {
    return Object.values(PROCESS_STEPS).sort((a, b) => a.step - b.step);
};

/**
 * API 경로로 ProcessStep 찾기
 *
 * @param {string} apiPath - API 경로
 * @returns {Object|undefined} ProcessStep 객체 또는 undefined
 */
export const getStepByApiPath = (apiPath) => {
    return Object.values(PROCESS_STEPS).find(s => s.apiPath === apiPath);
};

/**
 * 경로에서 프로젝트 ID를 실제 값으로 치환
 *
 * @param {Object} step - ProcessStep 객체
 * @param {string} projectId - 프로젝트 ID
 * @returns {string} 실제 경로
 */
export const getStepPath = (step, projectId) => {
    return step.path.replace(':projectId', projectId);
};

/**
 * 단계 진행률 계산
 *
 * @param {number} currentStepNumber - 현재 단계 번호
 * @returns {number} 진행률 (0-100)
 */
export const getProgressPercentage = (currentStepNumber) => {
    return Math.round((currentStepNumber / 7) * 100);
};

/**
 * 특정 단계 완료 여부 확인
 *
 * @param {number} targetStep - 확인할 단계 번호
 * @param {number} currentStep - 현재 단계 번호
 * @returns {boolean} 완료 여부
 */
export const isStepCompleted = (targetStep, currentStep) => {
    return targetStep < currentStep;
};

/**
 * 특정 단계 활성화 여부 확인
 *
 * @param {number} targetStep - 확인할 단계 번호
 * @param {number} currentStep - 현재 단계 번호
 * @returns {boolean} 활성화 여부
 */
export const isStepActive = (targetStep, currentStep) => {
    return targetStep === currentStep;
};

/**
 * 특정 단계 접근 가능 여부 확인
 *
 * @param {number} targetStep - 확인할 단계 번호
 * @param {number} currentStep - 현재 단계 번호
 * @returns {boolean} 접근 가능 여부
 */
export const isStepAccessible = (targetStep, currentStep) => {
    return targetStep <= currentStep;
};
