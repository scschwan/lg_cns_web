// frontend/src/services/multiFileUploadService.js

import api from './api';

const multiFileUploadService = {
    // ⭐ 파일 업로드 관련 API ⭐

    /**
     * Presigned URL 요청
     * POST /api/projects/{projectId}/upload/presigned-url
     */
    async getPresignedUrl(projectId, fileName, fileSize, sessionId = null) {
        const response = await api.post(
            `/projects/${projectId}/upload/presigned-url`,
            {
                fileName,
                fileSize,
                sessionId
            }
        );
        return response.data;
    },

    /**
     * S3 직접 업로드
     */
    async uploadToS3(presignedUrl, file, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    const percentComplete = Math.round((e.loaded * 100) / e.total);
                    onProgress(percentComplete);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Upload failed'));
            });

            xhr.open('PUT', presignedUrl);
            xhr.setRequestHeader('Content-Type', file.type);
            xhr.send(file);
        });
    },

    /**
     * 파일 업로드 완료 처리
     * POST /api/projects/{projectId}/upload/files
     */
    async completeFileUpload(projectId, uploadId, fileName, fileSize, s3Key, sessionId) {
        const response = await api.post(
            `/projects/${projectId}/upload/files`,
            {
                uploadId,
                fileName,
                fileSize,
                s3Key,
                sessionId
            }
        );
        return response.data;
    },

    /**
     * 업로드 상태 조회
     * GET /api/projects/{projectId}/upload/status/{uploadId}
     */
    async getUploadStatus(projectId, uploadId) {
        const response = await api.get(
            `/projects/${projectId}/upload/status/${uploadId}`
        );
        return response.data;
    },

    /**
     * 프로젝트 파일 목록 조회
     * GET /api/projects/{projectId}/upload/files
     */
    async getProjectFiles(projectId) {
        const response = await api.get(
            `/projects/${projectId}/upload/files`
        );
        return response.data;
    },

    /**
     * 파일 분석 (계정명 추출, 파티션 제안)
     * POST /api/projects/{projectId}/upload/analyze
     */
    async analyzeFiles(projectId, fileIds) {
        const response = await api.post(
            `/projects/${projectId}/upload/analyze`,
            { fileIds }
        );
        return response.data;
    },

    /**
     * 파일 컬럼 설정
     * PUT /api/projects/{projectId}/upload/files/{fileId}/columns
     */
    async setFileColumns(projectId, fileId, accountColumnName, amountColumnName) {
        const response = await api.put(
            `/projects/${projectId}/upload/files/${fileId}/columns`,
            {
                accountColumnName,
                amountColumnName
            }
        );
        return response.data;
    },

    // ⭐ 세션 관리 API ⭐

    /**
     * 세션 생성
     * POST /api/projects/{projectId}/upload/sessions
     */
    async createSession(projectId, sessionName, workerName, fileIds) {
        const response = await api.post(
            `/projects/${projectId}/upload/sessions`,
            {
                projectId,
                sessionName,
                workerName,
                fileIds
            }
        );
        return response.data;
    },

    /**
     * 세션 목록 조회
     * GET /api/projects/{projectId}/upload/sessions
     */
    async getSessions(projectId) {
        const response = await api.get(
            `/projects/${projectId}/upload/sessions`
        );
        return response.data;
    },

    /**
     * 세션 상세 조회
     * GET /api/projects/{projectId}/upload/sessions/{sessionId}
     */
    async getSession(projectId, sessionId) {
        const response = await api.get(
            `/projects/${projectId}/upload/sessions/${sessionId}`
        );
        return response.data;
    },

    /**
     * 세션 수정
     * PUT /api/projects/{projectId}/upload/sessions/{sessionId}
     */
    async updateSession(projectId, sessionId, sessionName, workerName) {
        const response = await api.put(
            `/projects/${projectId}/upload/sessions/${sessionId}`,
            {
                sessionName,
                workerName
            }
        );
        return response.data;
    },

    /**
     * 세션 시작 (Step 2 진입)
     * POST /api/projects/{projectId}/upload/sessions/{sessionId}/start
     */
    async startSession(projectId, sessionId) {
        const response = await api.post(
            `/projects/${projectId}/upload/sessions/${sessionId}/start`
        );
        return response.data;
    },

    /**
     * 세션 초기화
     * DELETE /api/projects/{projectId}/upload/sessions/{sessionId}/reset
     */
    async resetSession(projectId, sessionId) {
        await api.delete(
            `/projects/${projectId}/upload/sessions/${sessionId}/reset`
        );
    },

    /**
     * 세션 삭제
     * DELETE /api/projects/{projectId}/upload/sessions/{sessionId}
     */
    async deleteSession(projectId, sessionId) {
        await api.delete(
            `/projects/${projectId}/upload/sessions/${sessionId}`
        );
    },

    /**
     * 세션 병합
     * POST /api/projects/{projectId}/upload/sessions/merge
     */
    async mergeSessions(projectId, sessionIds, newSessionName, workerName) {
        const response = await api.post(
            `/projects/${projectId}/upload/sessions/merge`,
            {
                sessionIds,
                newSessionName,
                workerName
            }
        );
        return response.data;
    },

    // ⭐ 헬퍼 메서드 (전체 플로우) ⭐

    /**
     * 파일 업로드 전체 플로우
     *
     * 1. Presigned URL 요청
     * 2. S3 직접 업로드
     * 3. 업로드 완료 처리
     */
    async uploadFile(projectId, file, sessionId = null, onProgress = null) {
        try {
            // 1. Presigned URL 요청
            const presignedData = await this.getPresignedUrl(
                projectId,
                file.name,
                file.size,
                sessionId
            );

            const { presignedUrl, uploadId, s3Key, sessionId: returnedSessionId } = presignedData;

            // 2. S3 직접 업로드
            await this.uploadToS3(presignedUrl, file, onProgress);

            // 3. 업로드 완료 처리
            const fileData = await this.completeFileUpload(
                projectId,
                uploadId,
                file.name,
                file.size,
                s3Key,
                sessionId || returnedSessionId
            );

            return fileData;

        } catch (error) {
            console.error('파일 업로드 실패:', error);
            throw error;
        }
    }
};

export default multiFileUploadService;