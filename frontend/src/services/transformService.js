import api from './api';

const transformService = {
    /**
     * 키워드 통계 조회 (group by count + money 합산)
     */
    getKeywordStats: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/transform/keyword-stats`
        );
        return response.data;
    },

    /**
     * 키워드 검색 (like 검색)
     */
    searchKeywords: async (projectId, sessionId, keyword) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/transform/search-keywords`,
            { params: { keyword } }
        );
        return response.data;
    },

    /**
     * 키워드 변환 (치환)
     */
    replaceKeywords: async (projectId, sessionId, fromKeywords, toKeyword) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/transform/replace-keywords`,
            { fromKeywords, toKeyword }
        );
        return response.data;
    },

    /**
     * 원본 데이터 조회 (visible columns + 페이징 + 키워드 필터)
     */
    getOriginalData: async (projectId, sessionId, page = 0, size = 100, keyword = null) => {
        const params = { page, size };
        if (keyword) params.keyword = keyword;
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/transform/original-data`,
            { params }
        );
        return response.data;
    },

    /**
     * 검색 결과 데이터 조회 (visible columns + 페이징 + 키워드 필터)
     */
    getSearchData: async (projectId, sessionId, page = 0, size = 100, keyword = null) => {
        const params = { page, size };
        if (keyword) params.keyword = keyword;
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/transform/search-data`,
            { params }
        );
        return response.data;
    },
};

export default transformService;
