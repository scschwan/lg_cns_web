import api from './api';

const uploadService = {
    /**
     * Presigned URL 생성
     */
    getPresignedUrl: async (projectId, fileName, fileSize) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/presigned-url`,
            null,
            {
                params: { fileName, fileSize }
            }
        );
        return response.data;
    },

    /**
     * S3 직접 업로드 (Presigned URL 사용)
     */
    uploadToS3: async (presignedUrl, file, onProgress) => {
        const response = await fetch(presignedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        });

        if (!response.ok) {
            throw new Error(`S3 업로드 실패: ${response.statusText}`);
        }

        return response;
    },

    /**
     * 업로드 상태 조회
     */
    getUploadStatus: async (projectId, uploadId) => {
        const response = await api.get(
            `/api/projects/${projectId}/upload/status/${uploadId}`
        );
        return response.data;
    },

    /**
     * 프로젝트의 업로드된 파일 목록 조회
     */
    getProjectFiles: async (projectId) => {
        const response = await api.get(
            `/api/projects/${projectId}/upload/files`
        );
        return response.data;
    },

    /**
     * 파일 업로드 + 진행률 추적 (통합)
     */
    uploadFileWithProgress: async (projectId, file, onProgress) => {
        try {
            // 1. Presigned URL 요청
            onProgress?.(10, '업로드 준비 중...');
            const { presignedUrl, uploadId, sessionId, s3Key } =
                await uploadService.getPresignedUrl(projectId, file.name, file.size);

            // 2. S3 업로드
            onProgress?.(20, 'S3 업로드 중...');
            await uploadService.uploadToS3(presignedUrl, file);

            // 3. Lambda 처리 대기 (진행률 폴링)
            onProgress?.(40, 'Lambda 처리 중...');

            let status = { status: 'PROCESSING', progress: 0 };
            let attempts = 0;
            const maxAttempts = 300; // 최대 5분 (1초 * 300)

            while (status.status === 'PROCESSING' && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기

                status = await uploadService.getUploadStatus(projectId, uploadId);

                // 진행률 업데이트 (40% ~ 95%)
                const lambdaProgress = 40 + (status.progress || 0) * 0.55;
                onProgress?.(
                    Math.round(lambdaProgress),
                    `Lambda 처리 중... ${status.progress || 0}%`
                );

                if (status.status === 'COMPLETED') {
                    onProgress?.(100, '완료');
                    break;
                }

                if (status.status === 'FAILED') {
                    throw new Error(status.error || 'Lambda 처리 실패');
                }

                attempts++;
            }

            if (attempts >= maxAttempts) {
                throw new Error('업로드 처리 시간 초과');
            }

            return {
                uploadId,
                sessionId,
                s3Key,
                fileName: file.name,
                fileSize: file.size,
                status: status.status
            };

        } catch (error) {
            console.error('파일 업로드 오류:', error);
            throw error;
        }
    }
};

export default uploadService;