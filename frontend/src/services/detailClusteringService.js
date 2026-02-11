import api from './api';

const detailClusteringService = {
    getUnmergedClusters: async (projectId, sessionId, clusterId, page = 0, size = 20, keyword = null) => {
        const params = { clusterId, page, size };
        if (keyword) params.keyword = keyword;
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/unmerged`, { params }
        );
        return response.data;
    },

    getAllUnmergedClusterNumbers: async (projectId, sessionId, clusterId, keyword = null, supplier = null) => {
        const params = { clusterId };
        if (keyword) params.keyword = keyword;
        if (supplier) params.supplier = supplier;
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/unmerged-ids`, { params }
        );
        return response.data;
    },

    getKeywordStats: async (projectId, sessionId, clusterId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/keyword-stats`,
            { params: { clusterId } }
        );
        return response.data;
    },

    getSupplierStats: async (projectId, sessionId, clusterId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/supplier-stats`,
            { params: { clusterId } }
        );
        return response.data;
    },

    getMergedClusters: async (projectId, sessionId, clusterId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/merged`,
            { params: { clusterId } }
        );
        return response.data;
    },

    getStatistics: async (projectId, sessionId, clusterId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/statistics`,
            { params: { clusterId } }
        );
        return response.data;
    },

    mergeClusters: async (projectId, sessionId, clusterId, clusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/merge`,
            { clusterId, clusterNumbers }
        );
        return response.data;
    },

    unmergeClusters: async (projectId, sessionId, clusterId, mergedClusterNumber) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/unmerge`,
            { clusterId, mergedClusterNumber }
        );
        return response.data;
    },

    unmergePartialClusters: async (projectId, sessionId, clusterId, mergedClusterNumber, childClusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/unmerge-partial`,
            { clusterId, mergedClusterNumber, childClusterNumbers }
        );
        return response.data;
    },

    mergeMergedClusters: async (projectId, sessionId, clusterId, mergedClusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/merge-merged`,
            { clusterId, mergedClusterNumbers }
        );
        return response.data;
    },

    addToMergedCluster: async (projectId, sessionId, clusterId, targetMergedClusterNumber, clusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/add-to-merged`,
            { clusterId, targetMergedClusterNumber, clusterNumbers }
        );
        return response.data;
    },

    renameCluster: async (projectId, sessionId, clusterNumber, newName) => {
        const response = await api.put(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/rename`,
            { clusterNumber, newName }
        );
        return response.data;
    },

    advancedSearch: async (projectId, sessionId, params) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/advanced-search`,
            params
        );
        return response.data;
    },

    getAdvancedSearchClusterNumbers: async (projectId, sessionId, params) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/advanced-search-ids`,
            params
        );
        return response.data;
    },

    getSearchableColumns: async (projectId, sessionId, clusterId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/searchable-columns`,
            { params: { clusterId } }
        );
        return response.data;
    },

    getKeywordHierarchy: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/keyword-hierarchy`
        );
        return response.data;
    },

    addKeywordHierarchy: async (projectId, sessionId, level, parentId, keyword) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/keyword-hierarchy`,
            { level, parentId, keyword }
        );
        return response.data;
    },

    updateKeywordHierarchy: async (projectId, sessionId, id, keyword) => {
        const response = await api.put(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/keyword-hierarchy/${id}`,
            { keyword }
        );
        return response.data;
    },

    deleteKeywordHierarchy: async (projectId, sessionId, id) => {
        const response = await api.delete(
            `/api/projects/${projectId}/sessions/${sessionId}/detail-clustering/keyword-hierarchy/${id}`
        );
        return response.data;
    },
};

export default detailClusteringService;
