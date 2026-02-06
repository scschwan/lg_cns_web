// frontend/src/services/exportService.js

import api from './api';

const exportService = {
    // ============================================
    // 📊 전체 데이터 조회 (클러스터명 포함)
    // ============================================

    /**
     * 전체 데이터 조회 (클러스터명 + 세부클러스터명 포함)
     * GET /api/projects/{projectId}/sessions/{sessionId}/export/all-data
     */
    getAllDataWithClusterInfo: async (projectId, sessionId, page = 0, size = 100) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/export/all-data`,
            { params: { page, size } }
        );
        return response.data;
    },

    // ============================================
    // 📋 병합된 클러스터 목록 조회
    // ============================================

    /**
     * 병합된 클러스터 목록 조회 (세부 클러스터 포함)
     * GET /api/projects/{projectId}/sessions/{sessionId}/export/merged-clusters
     */
    getMergedClustersWithSubClusters: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/export/merged-clusters`
        );
        return response.data;
    },

    // ============================================
    // 📝 클러스터별 상세 데이터 조회
    // ============================================

    /**
     * 클러스터별 상세 데이터 조회
     * GET /api/projects/{projectId}/sessions/{sessionId}/export/cluster/{clusterNumber}/data
     */
    getClusterDetailData: async (projectId, sessionId, clusterNumber, page = 0, size = 100) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/export/cluster/${clusterNumber}/data`,
            { params: { page, size } }
        );
        return response.data;
    },

    // ============================================
    // ✏️ 클러스터명 수정
    // ============================================

    /**
     * 클러스터명 수정
     * PUT /api/projects/{projectId}/sessions/{sessionId}/export/cluster/{clusterNumber}/name
     */
    updateClusterName: async (projectId, sessionId, clusterNumber, clusterName) => {
        const response = await api.put(
            `/api/projects/${projectId}/sessions/${sessionId}/export/cluster/${clusterNumber}/name`,
            { clusterName }
        );
        return response.data;
    },

    // ============================================
    // ⚙️ 제거열 설정 (컬럼 가시성)
    // ============================================

    /**
     * 컬럼 설정 조회
     * GET /api/projects/{projectId}/sessions/{sessionId}/export/columns
     */
    getColumnSettings: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/export/columns`
        );
        return response.data;
    },

    /**
     * 컬럼 설정 업데이트
     * PUT /api/projects/{projectId}/sessions/{sessionId}/export/columns
     */
    updateColumnSettings: async (projectId, sessionId, columns) => {
        const response = await api.put(
            `/api/projects/${projectId}/sessions/${sessionId}/export/columns`,
            columns
        );
        return response.data;
    },

    // ============================================
    // 📥 Excel 내보내기
    // ============================================

    /**
     * 선택된 클러스터 Excel 내보내기
     * POST /api/projects/{projectId}/sessions/{sessionId}/export/export/selected
     */
    exportSelectedClusters: async (projectId, sessionId, clusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/export/export/selected`,
            { clusterNumbers }
        );
        return response.data;
    },

    /**
     * 전체 클러스터 Excel 내보내기
     * POST /api/projects/{projectId}/sessions/{sessionId}/export/export/all
     */
    exportAllClusters: async (projectId, sessionId) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/export/export/all`
        );
        return response.data;
    },

    /**
     * 기존 Export 다운로드 URL 조회
     * GET /api/projects/{projectId}/sessions/{sessionId}/export/download-url
     */
    getExportDownloadUrl: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/export/download-url`
        );
        return response.data;
    },

    // ============================================
    // ✅ 세션 완료
    // ============================================

    /**
     * 세션 완료 처리
     * POST /api/projects/{projectId}/sessions/{sessionId}/export/complete
     */
    completeSession: async (projectId, sessionId, forceExport = false) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/export/complete`,
            { forceExport }
        );
        return response.data;
    },

    // ============================================
    // 🔧 유틸리티
    // ============================================

    /**
     * Excel 파일 자동 다운로드
     */
    downloadExcel: (downloadUrl, filename = 'export.xlsx') => {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

export default exportService;
