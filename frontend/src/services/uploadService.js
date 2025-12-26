// frontend/src/services/uploadService.js

import api from './api';

const uploadService = {
    // ============================================
    // 📁 파일 업로드 관련 API
    // ============================================

    /**
     * Presigned URL 요청
     * POST /api/projects/{projectId}/upload/presigned-url
     */
    getPresignedUrl: async (projectId, fileName, fileSize, sessionId = null) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/presigned-url`,
            {
                fileName,
                fileSize,
                sessionId
            }
        );
        return response.data;
    },

    /**
     * S3 직접 업로드 (XMLHttpRequest 버전 - 진행률 지원)
     */
    uploadToS3: async (presignedUrl, file, onProgress) => {
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
            xhr.setRequestHeader('Content-Type', file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            xhr.send(file);
        });
    },

    /**
     * 파일 업로드 완료 처리
     */
    completeFileUpload: async (projectId, uploadData) => {
        console.log('파일 업로드 완료 처리:', {
            projectId,
            uploadId: uploadData.uploadId,
            sessionId: uploadData.sessionId,
            sessionIdType: typeof uploadData.sessionId  // 디버깅
        });

        // sessionId 타입 검증
        if (typeof uploadData.sessionId !== 'string') {
            throw new Error(
                `sessionId는 String이어야 합니다. ` +
                `현재 타입: ${typeof uploadData.sessionId}, ` +
                `값: ${JSON.stringify(uploadData.sessionId)}`
            );
        }

        const response = await api.post(
            `/api/projects/${projectId}/upload/files`,
            {
                uploadId: uploadData.uploadId,
                sessionId: uploadData.sessionId,  // ✅ String
                fileName: uploadData.fileName,
                fileSize: uploadData.fileSize,
                s3Key: uploadData.s3Key
            }
        );

        return response.data;
    },

    /**
     * 업로드 상태 조회
     * GET /api/projects/{projectId}/upload/status/{uploadId}
     */
    getUploadStatus: async (projectId, uploadId) => {
        const response = await api.get(
            `/api/projects/${projectId}/upload/status/${uploadId}`
        );
        return response.data;
    },

    /**
     * 프로젝트 파일 목록 조회
     * GET /api/projects/{projectId}/upload/files
     */
    getProjectFiles: async (projectId) => {
        const response = await api.get(
            `/api/projects/${projectId}/upload/files`
        );
        return response.data;
    },

    /**
     * 파일 분석 (계정명 추출, 파티션 제안)
     * POST /api/projects/{projectId}/upload/analyze
     */
    analyzeFiles: async (projectId, fileIds) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/analyze`,
            { fileIds }
        );
        return response.data;
    },

    /**
     * 파일 컬럼 설정 (계정명/금액 컬럼)
     * PUT /api/projects/{projectId}/upload/files/{fileId}/columns
     */
    setFileColumns: async (projectId, fileId, accountColumnName, amountColumnName) => {
        const response = await api.put(
            `/api/projects/${projectId}/upload/files/${fileId}/columns`,
            {
                accountColumnName,
                amountColumnName
            }
        );
        return response.data;
    },

    // ============================================
    // 📋 세션 관리 API
    // ============================================

    /**
     * 세션 생성
     * POST /api/projects/{projectId}/upload/sessions
     */
    createSession: async (projectId, sessionName, workerName, fileIds) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/sessions`,
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
    getSessions: async (projectId) => {
        const response = await api.get(
            `/api/projects/${projectId}/upload/sessions`
        );
        return response.data;
    },

    /**
     * 세션 상세 조회
     * GET /api/projects/{projectId}/upload/sessions/{sessionId}
     */
    getSession: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/upload/sessions/${sessionId}`
        );
        return response.data;
    },

    /**
     * 세션 수정
     * PUT /api/projects/{projectId}/upload/sessions/{sessionId}
     */
    updateSession: async (projectId, sessionId, sessionName, workerName) => {
        const response = await api.put(
            `/api/projects/${projectId}/upload/sessions/${sessionId}`,
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
    startSession: async (projectId, sessionId) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/sessions/${sessionId}/start`
        );
        return response.data;
    },

    /**
     * 세션 초기화
     * DELETE /api/projects/{projectId}/upload/sessions/{sessionId}/reset
     */
    resetSession: async (projectId, sessionId) => {
        await api.delete(
            `/api/projects/${projectId}/upload/sessions/${sessionId}/reset`
        );
    },

    /**
     * 세션 삭제
     * DELETE /api/projects/{projectId}/upload/sessions/{sessionId}
     */
    deleteSession: async (projectId, sessionId) => {
        await api.delete(
            `/api/projects/${projectId}/upload/sessions/${sessionId}`
        );
    },

    /**
     * 세션 병합
     * POST /api/projects/{projectId}/upload/sessions/merge
     */
    mergeSessions: async (projectId, sessionIds, newSessionName, workerName) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/sessions/merge`,
            {
                sessionIds,
                newSessionName,
                workerName
            }
        );
        return response.data;
    },

    // ============================================
    // 🔧 헬퍼 메서드 (전체 플로우)
    // ============================================

    /**
     * 파일 업로드 전체 플로우 (간단 버전)
     * 1. Presigned URL 요청
     * 2. S3 직접 업로드
     * 3. 업로드 완료 처리
     */
    uploadFile: async (projectId, file, sessionId = null, onProgress = null) => {
        try {
            // 1. Presigned URL 요청
            const presignedData = await uploadService.getPresignedUrl(
                projectId,
                file.name,
                file.size,
                sessionId
            );

            const { presignedUrl, uploadId, s3Key, sessionId: returnedSessionId } = presignedData;

            // 2. S3 직접 업로드
            await uploadService.uploadToS3(presignedUrl, file, onProgress);

            // 3. 업로드 완료 처리
            const fileData = await uploadService.completeFileUpload(
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
    },

    /**
     * 파일 업로드 + Lambda 진행률 추적 (고급 버전)
     * ⭐ 수정: completeFileUpload() 호출 추가
     */
    uploadFileWithProgress: async (projectId, file, onProgress) => {
        try {
            // 1. Presigned URL 요청
            onProgress?.(5, '업로드 준비 중...');
            const { presignedUrl, uploadId, sessionId, s3Key } =
                await uploadService.getPresignedUrl(projectId, file.name, file.size);

            console.log('Presigned URL 요청 성공:', {
                uploadId,
                sessionId,
                s3Key,
                sessionIdType: typeof sessionId  // 디버깅
            });

            // 2. S3 업로드 (진행률 5% → 30%)
            onProgress?.(10, 'S3 업로드 중...');

            await uploadService.uploadToS3(presignedUrl, file, (s3Progress) => {
                // S3 업로드 진행률을 10% ~ 30% 범위로 매핑
                const mappedProgress = 10 + (s3Progress * 0.2);
                onProgress?.(Math.round(mappedProgress), `S3 업로드 중... ${s3Progress}%`);
            });

            console.log('S3 업로드 완료');

            // ⭐⭐⭐ 3. 파일 업로드 완료 처리 (MongoDB 등록)
            onProgress?.(35, '파일 등록 중...');

            const fileData = await uploadService.completeFileUpload(projectId, {
                uploadId,
                sessionId,  // ✅ String 타입
                fileName: file.name,
                fileSize: file.size,
                s3Key
            });

            console.log('파일 등록 완료:', fileData);

            // 4. Lambda 처리 대기 (진행률 40% → 95%)
            onProgress?.(40, 'Lambda 처리 시작...');

            let status = { status: 'PROCESSING', progress: 0 };
            let attempts = 0;
            const maxAttempts = 300; // 최대 5분

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

            console.log('전체 업로드 프로세스 완료');

            return {
                uploadId,
                sessionId,
                s3Key,
                fileName: file.name,
                fileSize: file.size,
                status: status.status,
                fileId: fileData.id  // ⭐ MongoDB fileId 반환
            };

        } catch (error) {
            console.error('파일 업로드 오류:', error);
            throw error;
        }
    },

    // ============================================
    // 📊 MultiFileUploadPage 전용 API (추가)
    // ============================================

    /**
     * 파일 목록 조회 (alias)
     * getProjectFiles()의 별칭
     */
    getFiles: async (projectId) => {
        return uploadService.getProjectFiles(projectId);
    },

    /**
     * 파일 컬럼 업데이트
     * PUT /api/projects/{projectId}/upload/files/{fileId}/columns
     */
    updateFileColumns: async (projectId, fileId, columns) => {
        // 필드명 변환: accountColumn → accountColumnName
        const requestBody = {};
        if (columns.accountColumn) {
            requestBody.accountColumnName = columns.accountColumn;
        }
        if (columns.amountColumn) {
            requestBody.amountColumnName = columns.amountColumn;
        }

        const response = await api.put(
            `/api/projects/${projectId}/upload/files/${fileId}/columns`,
            requestBody
        );
        return response.data;
    },

    /**
     * 계정명 값 추출
     * POST /api/projects/{projectId}/upload/files/{fileId}/extract-accounts
     */
    extractAccountValues: async (projectId, fileId, columnName) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/files/${fileId}/extract-accounts`,
            { columnName }
        );
        return response.data;
    },

    /**
     * 금액 합계 계산
     * POST /api/projects/{projectId}/upload/files/{fileId}/calculate-amount
     */
    calculateTotalAmount: async (projectId, fileId, columnName) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/files/${fileId}/calculate-amount`,
            { columnName }
        );
        return response.data.totalAmount;
    },

    /**
     * 파티션 분석 (계정명별 그룹핑)
     * POST /api/projects/{projectId}/upload/analyze-partitions
     */
    analyzePartitions: async (projectId, fileIds) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/analyze-partitions`,
            { fileIds }
        );
        return response.data;
    },

    /**
     * 세션 일괄 생성 (복수형)
     * POST /api/projects/{projectId}/upload/sessions/batch
     */
    createSessions: async (projectId, partitions) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/sessions/batch`,
            { partitions }
        );
        return response.data;
    },

    /**
     * 세션에 파일 추가
     * POST /api/projects/{projectId}/upload/sessions/{sessionId}/files
     */
    addFilesToSession: async (projectId, sessionId, fileIds) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/sessions/${sessionId}/files`,
            { fileIds }
        );
        return response.data;
    },

    /**
     * 세션 일괄 삭제 (복수형)
     * DELETE /api/projects/{projectId}/upload/sessions/batch
     */
    deleteSessions: async (projectId, sessionIds) => {
        await api.delete(
            `/api/projects/${projectId}/upload/sessions/batch`,
            {
                data: { sessionIds }
            }
        );
    },

    /**
     * 세션 완료 처리 (계정 분석 시작)
     * POST /api/projects/{projectId}/upload/sessions/{sessionId}/complete
     */
    completeSession: async (projectId, sessionId) => {
        const response = await api.post(
            `/api/projects/${projectId}/upload/sessions/${sessionId}/complete`
        );
        return response.data;
    },

    /**
     * 파일 삭제
     * DELETE /api/projects/{projectId}/upload/files/{fileId}
     */
    deleteFile: async (projectId, fileId) => {
        await api.delete(
            `/api/projects/${projectId}/upload/files/${fileId}`
        );
    },

    /**
     * 세션 결과 다운로드 URL
     * GET /api/projects/{projectId}/upload/sessions/{sessionId}/download
     */
    downloadResult: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/upload/sessions/${sessionId}/download`
        );
        return response.data.downloadUrl;
    }
};



export default uploadService;