import api from './api';

const clusteringService = {
    /**
     * 미병합 클러스터 생성 (process_view_data 기반)
     */
    generateClusters: async (projectId, sessionId) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/generate`
        );
        return response.data;
    },

    /**
     * 미병합 클러스터 목록 조회 (페이징)
     */
    getUnmergedClusters: async (projectId, sessionId, page = 0, size = 20) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/unmerged`,
            { params: { page, size } }
        );
        return response.data;
    },

    /**
     * 병합 클러스터 목록 조회
     */
    getMergedClusters: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merged`
        );
        return response.data;
    },

    /**
     * 통계 조회
     */
    getStatistics: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/statistics`
        );
        return response.data;
    },

    /**
     * 클러스터 병합
     */
    mergeClusters: async (projectId, sessionId, clusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge`,
            { clusterNumbers }
        );
        return response.data;
    },

    /**
     * 클러스터 병합 해제 (전체)
     */
    unmergeClusters: async (projectId, sessionId, mergedClusterNumber) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/unmerge`,
            { mergedClusterNumber }
        );
        return response.data;
    },

    /**
     * 클러스터명 수정
     */
    renameCluster: async (projectId, sessionId, clusterNumber, newName) => {
        const response = await api.put(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/rename`,
            { clusterNumber, newName }
        );
        return response.data;
    },
};

export default clusteringService;
