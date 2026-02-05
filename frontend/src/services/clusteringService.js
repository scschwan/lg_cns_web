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
};

export default clusteringService;
