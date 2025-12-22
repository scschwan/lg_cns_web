import api from './api';

const sessionService = {
    // 업로드된 파일 목록 조회
    getUploadedFiles: async (projectId) => {
        const response = await api.get(`/api/projects/${projectId}/upload/files`);
        return response.data;
    },

    // Presigned URL 생성
    getPresignedUrl: async (projectId, fileName, fileSize) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/presigned-url`,
            null,
            {
                params: { fileName, fileSize },
            }
        );
        return response.data;
    },

    // S3 직접 업로드
    uploadToS3: async (presignedUrl, file, onProgress) => {
        await api.put(presignedUrl, file, {
            headers: {
                'Content-Type': file.type,
            },
            onUploadProgress: onProgress,
        });
    },

    // 업로드 상태 조회
    getUploadStatus: async (projectId, uploadId) => {
        const response = await api.get(
            `/api/projects/${projectId}/upload/status/${uploadId}`
        );
        return response.data;
    },

    // 세션 생성
    createSession: async (sessionData) => {
        const response = await api.post('/api/sessions', sessionData);
        return response.data;
    },

    // 프로젝트 세션 목록
    getProjectSessions: async (projectId) => {
        const response = await api.get('/api/sessions', {
            params: { projectId },
        });
        return response.data;
    },

    // 세션 상세
    getSession: async (sessionId) => {
        const response = await api.get(`/api/sessions/${sessionId}`);
        return response.data;
    },

    // 세션 수정
    updateSession: async (sessionId, sessionData) => {
        const response = await api.put(`/api/sessions/${sessionId}`, sessionData);
        return response.data;
    },

    // 파일 컬럼 설정
    setFileColumns: async (sessionId, columnData) => {
        const response = await api.put(`/api/sessions/${sessionId}/columns`, columnData);
        return response.data;
    },

    // 세션 시작
    startSession: async (sessionId) => {
        const response = await api.post(`/api/sessions/${sessionId}/start`);
        return response.data;
    },

    // 세션 초기화
    resetSession: async (sessionId) => {
        await api.delete(`/api/sessions/${sessionId}/reset`);
    },

    // 세션 삭제
    deleteSession: async (sessionId) => {
        await api.delete(`/api/sessions/${sessionId}`);
    },

    // 세션 병합
    mergeSessions: async (mergeData) => {
        const response = await api.post('/api/sessions/merge', mergeData);
        return response.data;
    },
};

export default sessionService;