import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

/**
 * 시스템 상태 조회 서비스
 * - 유지보수 모드 / Lambda 진행률 등 공개 API 호출
 * - 인증 토큰 없이 호출 가능 (maintenance-status, upload-progress)
 */
const systemService = {
    /**
     * 유지보수/Lambda 상태 조회
     * GET /api/system/maintenance-status
     */
    getMaintenanceStatus: async () => {
        const token = localStorage.getItem('authToken');
        const headers = {};
        if (token && token !== 'undefined' && token !== 'null') {
            headers.Authorization = `Bearer ${token}`;
        }
        const res = await axios.get(`${API_URL}/api/system/maintenance-status`, { headers });
        return res.data;
    },

    /**
     * Lambda 업로드 진행률 조회
     * GET /api/system/upload-progress
     */
    getUploadProgress: async () => {
        const token = localStorage.getItem('authToken');
        const headers = {};
        if (token && token !== 'undefined' && token !== 'null') {
            headers.Authorization = `Bearer ${token}`;
        }
        const res = await axios.get(`${API_URL}/api/system/upload-progress`, { headers });
        return res.data;
    },
};

export default systemService;
