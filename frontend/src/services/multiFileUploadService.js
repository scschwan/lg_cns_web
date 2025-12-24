// frontend/src/services/multiFileUploadService.js

import api from './api';
import uploadService from './uploadService';

const multiFileUploadService = {
    // 파일 목록 조회
    async getFiles(projectId) {
        const response = await api.get(`/projects/${projectId}/files`);
        return response.data;
    },

    // 파일 업로드
    async uploadFile(projectId, file, metadata) {
        // 1. Presigned URL 요청
        const presignedResponse = await api.post(
            `/projects/${projectId}/files/presigned-url`,
            {
                fileName: file.name,
                fileSize: file.size,
                detectedColumns: metadata.columns,
                rowCount: metadata.rowCount
            }
        );

        const { presignedUrl, uploadId, fileId } = presignedResponse.data;

        // 2. S3 직접 업로드
        await fetch(presignedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });

        // 3. 업로드 완료 알림
        await api.post(
            `/projects/${projectId}/files/${fileId}/complete`,
            { uploadId }
        );

        return {
            id: fileId,
            fileName: file.name,
            fileSize: file.size,
            detectedColumns: metadata.columns,
            rowCount: metadata.rowCount,
            accountColumn: null,
            amountColumn: null,
            accountValues: [],
            totalAmount: 0
        };
    },

    // 파일 컬럼 업데이트
    async updateFileColumns(projectId, fileId, columns) {
        const response = await api.put(
            `/projects/${projectId}/files/${fileId}/columns`,
            columns
        );
        return response.data;
    },

    // 계정명 추출
    async extractAccountValues(projectId, fileId, columnName) {
        const response = await api.post(
            `/projects/${projectId}/files/${fileId}/extract-accounts`,
            { columnName }
        );
        return response.data.accounts;
    },

    // 금액 합산
    async calculateTotalAmount(projectId, fileId, columnName) {
        const response = await api.post(
            `/projects/${projectId}/files/${fileId}/calculate-amount`,
            { columnName }
        );
        return response.data.totalAmount;
    },

    // 파일 삭제
    async deleteFile(projectId, fileId) {
        await api.delete(`/projects/${projectId}/files/${fileId}`);
    },

    // 세션 목록 조회
    async getSessions(projectId) {
        const response = await api.get(`/projects/${projectId}/sessions`);
        return response.data;
    },

    // 파티션 분석
    async analyzePartitions(projectId, fileIds) {
        const response = await api.post(
            `/projects/${projectId}/sessions/analyze-partitions`,
            { fileIds }
        );
        return response.data;
    },

    // 세션 생성
    async createSessions(projectId, partitions) {
        const response = await api.post(
            `/projects/${projectId}/sessions`,
            { partitions }
        );
        return response.data.sessions;
    },

    // 세션 수정
    async updateSession(projectId, sessionId, updates) {
        const response = await api.put(
            `/projects/${projectId}/sessions/${sessionId}`,
            updates
        );
        return response.data;
    },

    // 세션에 파일 추가
    async addFilesToSession(projectId, sessionId, fileIds) {
        const response = await api.post(
            `/projects/${projectId}/sessions/${sessionId}/add-files`,
            { fileIds }
        );
        return response.data;
    },

    // 세션 병합
    async mergeSessions(projectId, sessionIds) {
        const response = await api.post(
            `/projects/${projectId}/sessions/merge`,
            { sessionIds }
        );
        return response.data;
    },

    // 세션 삭제 (일괄)
    async deleteSessions(projectId, sessionIds) {
        await api.post(
            `/projects/${projectId}/sessions/delete-batch`,
            { sessionIds }
        );
    },

    // 세션 완료 (계정 분석 시작)
    async completeSession(projectId, sessionId) {
        const response = await api.post(
            `/projects/${projectId}/sessions/${sessionId}/complete`
        );
        return response.data;
    },

    // 결과 다운로드
    async downloadResult(projectId, sessionId) {
        const response = await api.get(
            `/projects/${projectId}/sessions/${sessionId}/result/download`
        );
        return response.data.downloadUrl;
    }
};

export default multiFileUploadService;