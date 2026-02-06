import api from './api';

const clusteringService = {
    generateClusters: async (projectId, sessionId, options = {}) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/generate`,
            { includeSupplier: !!options.includeSupplier, includeCostCenter: !!options.includeCostCenter }
        );
        return response.data;
    },

    getUnmergedClusters: async (projectId, sessionId, page = 0, size = 20, keyword = null) => {
        const params = { page, size };
        if (keyword) params.keyword = keyword;
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/unmerged`, { params }
        );
        return response.data;
    },

    getAllUnmergedClusterNumbers: async (projectId, sessionId, keyword = null) => {
        const params = {};
        if (keyword) params.keyword = keyword;
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/unmerged-ids`, { params }
        );
        return response.data;
    },

    getKeywordStats: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/keyword-stats`
        );
        return response.data;
    },

    getSupplierStats: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/supplier-stats`
        );
        return response.data;
    },

    getMergedClusters: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merged`
        );
        return response.data;
    },

    getStatistics: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/statistics`
        );
        return response.data;
    },

    mergeClusters: async (projectId, sessionId, clusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge`,
            { clusterNumbers }
        );
        return response.data;
    },

    unmergeClusters: async (projectId, sessionId, mergedClusterNumber) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/unmerge`,
            { mergedClusterNumber }
        );
        return response.data;
    },

    /** 부분 병합 해제 (선택한 자식만) */
    unmergePartialClusters: async (projectId, sessionId, mergedClusterNumber, childClusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/unmerge-partial`,
            { mergedClusterNumber, childClusterNumbers }
        );
        return response.data;
    },

    /** 병합 클러스터끼리 병합 */
    mergeMergedClusters: async (projectId, sessionId, mergedClusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge-merged`,
            { mergedClusterNumbers }
        );
        return response.data;
    },

    /** 추가 병합 (기존 병합 클러스터에 미병합 항목 추가) */
    addToMergedCluster: async (projectId, sessionId, targetMergedClusterNumber, clusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/add-to-merged`,
            { targetMergedClusterNumber, clusterNumbers }
        );
        return response.data;
    },

    renameCluster: async (projectId, sessionId, clusterNumber, newName) => {
        const response = await api.put(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/rename`,
            { clusterNumber, newName }
        );
        return response.data;
    },

    // ============================================================
    // 고급 검색 API
    // ============================================================

    /** 고급 검색 (컬럼 선택, 완전일치, 제외, 결과내 재검색) */
    advancedSearch: async (projectId, sessionId, params) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/advanced-search`,
            params
        );
        return response.data;
    },

    /** 고급 검색 결과의 전체 clusterNumber 목록 조회 */
    getAdvancedSearchClusterNumbers: async (projectId, sessionId, params) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/advanced-search-ids`,
            params
        );
        return response.data;
    },

    /** 검색 가능한 컬럼 목록 조회 */
    getSearchableColumns: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/searchable-columns`
        );
        return response.data;
    },

    // ============================================================
    // 키워드 계층 API (Lv1/Lv2/Lv3)
    // ============================================================

    /** 키워드 계층 전체 조회 */
    getKeywordHierarchy: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/keyword-hierarchy`
        );
        return response.data;
    },

    /** 키워드 추가 */
    addKeywordHierarchy: async (projectId, sessionId, level, parentId, keyword) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/keyword-hierarchy`,
            { level, parentId, keyword }
        );
        return response.data;
    },

    /** 키워드 수정 */
    updateKeywordHierarchy: async (projectId, sessionId, id, keyword) => {
        const response = await api.put(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/keyword-hierarchy/${id}`,
            { keyword }
        );
        return response.data;
    },

    /** 키워드 삭제 */
    deleteKeywordHierarchy: async (projectId, sessionId, id) => {
        const response = await api.delete(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/keyword-hierarchy/${id}`
        );
        return response.data;
    },
};

export default clusteringService;
