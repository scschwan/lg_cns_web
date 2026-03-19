/**
 * preprocessingService - 전처리 단계 API 서비스 (Step 3)
 *
 * 구분자/불용어 설정, 키워드 추출(구분자 기반/NLP 기반),
 * 1글자 제거, 데이터 조회 등 전처리 관련 API를 제공한다.
 *
 * 모든 API는 /api/projects/{projectId}/sessions/{sessionId}/preprocessing/ 하위 경로를 사용한다.
 */
import api from './api';

const preprocessingService = {
    /**
     * 세션 정보 조회 (필수항목 매핑 포함)
     */
    getSessionInfo: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/preprocessing/session-info`
        );
        return response.data;
    },

    /**
     * process_data 페이징 조회 (타겟 + 결과 테이블)
     */
    getProcessData: async (projectId, sessionId, page = 0, size = 100) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/preprocessing/data`,
            { params: { page, size } }
        );
        return response.data;
    },

    /**
     * 구분자/불용어 설정 조회
     */
    getConfig: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/preprocessing/config`
        );
        return response.data;
    },

    /**
     * 구분자/불용어 설정 저장
     */
    saveConfig: async (projectId, sessionId, { separators, stopwords }) => {
        const response = await api.put(
            `/api/projects/${projectId}/sessions/${sessionId}/preprocessing/config`,
            { separators, stopwords }
        );
        return response.data;
    },

    /**
     * 키워드 추출 진행 상태 조회 (Redis 폴링)
     * @param type "separator" | "nlp"
     */
    getExtractProgress: async (projectId, sessionId, type = 'separator') => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/preprocessing/extract-progress`,
            { params: { type } }
        );
        return response.data;
    },

    /**
     * 키워드 추출 (구분자 기반)
     */
    extractKeywords: async (projectId, sessionId) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/preprocessing/extract-keywords`
        );
        return response.data;
    },

    /**
     * 1글자 제거
     */
    removeSingleChar: async (projectId, sessionId) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/preprocessing/remove-single-char`
        );
        return response.data;
    },

    /**
     * NLP 기반 키워드 추출 (형태소 분석)
     */
    extractKeywordsNlp: async (projectId, sessionId, minKeywordLength = 4) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/preprocessing/extract-keywords-nlp`,
            { minKeywordLength }
        );
        return response.data;
    },
};

export default preprocessingService;
