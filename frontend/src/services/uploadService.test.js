/**
 * uploadService 단위 테스트
 *
 * 테스트 대상:
 * - getPresignedUrl: Presigned URL 요청
 * - uploadToS3: S3 직접 업로드 (진행률 포함)
 * - completeFileUpload: sessionId 타입 검증 및 업로드 완료 처리
 * - getUploadStatus: 업로드 상태 조회 (응답 구조 변경 반영)
 * - extractArray 헬퍼: 다양한 API 응답 형식 처리
 *
 * 실행 방법: npx vitest run src/services/uploadService.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// api 모듈 mock
vi.mock('./api', () => ({
    default: {
        post: vi.fn(),
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    }
}));

import api from './api';
import uploadService from './uploadService';

describe('uploadService', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ========== getPresignedUrl 테스트 ==========

    describe('getPresignedUrl', () => {
        it('올바른 엔드포인트로 POST 요청을 보낸다', async () => {
            const mockResponse = {
                data: {
                    presignedUrl: 'https://s3.amazonaws.com/test-bucket/test-key?...',
                    uploadId: 'upload-001',
                    sessionId: 'session-001',
                    s3Key: 'uploads/project-001/session-001/upload-001/test.xlsx',
                }
            };
            api.post.mockResolvedValue(mockResponse);

            const result = await uploadService.getPresignedUrl(
                'project-001', 'test.xlsx', 1024
            );

            expect(api.post).toHaveBeenCalledWith(
                '/api/projects/project-001/upload/presigned-url',
                { fileName: 'test.xlsx', fileSize: 1024, sessionId: null }
            );
            expect(result.uploadId).toBe('upload-001');
            expect(result.sessionId).toBe('session-001');
        });

        it('sessionId를 전달하면 요청 body에 포함한다', async () => {
            api.post.mockResolvedValue({ data: {} });

            await uploadService.getPresignedUrl(
                'project-001', 'test.xlsx', 1024, 'existing-session'
            );

            expect(api.post).toHaveBeenCalledWith(
                '/api/projects/project-001/upload/presigned-url',
                { fileName: 'test.xlsx', fileSize: 1024, sessionId: 'existing-session' }
            );
        });
    });

    // ========== uploadToS3 테스트 ==========

    describe('uploadToS3', () => {
        it('XMLHttpRequest로 S3에 PUT 요청을 보낸다', async () => {
            const mockXHR = {
                upload: { addEventListener: vi.fn() },
                addEventListener: vi.fn(),
                open: vi.fn(),
                setRequestHeader: vi.fn(),
                send: vi.fn(),
                status: 200,
            };

            mockXHR.addEventListener.mockImplementation((event, callback) => {
                if (event === 'load') callback();
            });

            vi.stubGlobal('XMLHttpRequest', vi.fn(() => mockXHR));

            const presignedUrl = 'https://s3.amazonaws.com/bucket/key?token=abc';
            const file = new File(['content'], 'test.xlsx');
            const onProgress = vi.fn();

            await uploadService.uploadToS3(presignedUrl, file, onProgress);

            expect(mockXHR.open).toHaveBeenCalledWith('PUT', presignedUrl);
            expect(mockXHR.setRequestHeader).toHaveBeenCalledWith(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            expect(mockXHR.send).toHaveBeenCalledWith(file);
        });

        it('S3 업로드 진행률 콜백이 onProgress에 전달된다', async () => {
            const mockXHR = {
                upload: { addEventListener: vi.fn() },
                addEventListener: vi.fn(),
                open: vi.fn(),
                setRequestHeader: vi.fn(),
                send: vi.fn(),
                status: 200,
            };

            // progress 이벤트 시뮬레이션
            mockXHR.upload.addEventListener.mockImplementation((event, callback) => {
                if (event === 'progress') {
                    callback({ lengthComputable: true, loaded: 512, total: 1024 });
                }
            });
            mockXHR.addEventListener.mockImplementation((event, callback) => {
                if (event === 'load') callback();
            });

            vi.stubGlobal('XMLHttpRequest', vi.fn(() => mockXHR));

            const file = new File(['content'], 'test.xlsx');
            const onProgress = vi.fn();

            await uploadService.uploadToS3('https://s3.amazonaws.com/key', file, onProgress);

            // 50% 진행률이 콜백으로 전달되어야 함
            expect(onProgress).toHaveBeenCalledWith(50);
        });

        it('HTTP 200 외 상태코드 시 에러를 throw한다', async () => {
            const mockXHR = {
                upload: { addEventListener: vi.fn() },
                addEventListener: vi.fn(),
                open: vi.fn(),
                setRequestHeader: vi.fn(),
                send: vi.fn(),
                status: 403,
            };

            mockXHR.addEventListener.mockImplementation((event, callback) => {
                if (event === 'load') callback();
            });

            vi.stubGlobal('XMLHttpRequest', vi.fn(() => mockXHR));

            const file = new File(['content'], 'test.xlsx');

            await expect(
                uploadService.uploadToS3('https://s3.amazonaws.com/key', file, null)
            ).rejects.toThrow('Upload failed: 403');
        });
    });

    // ========== completeFileUpload 테스트 ==========

    describe('completeFileUpload', () => {
        it('올바른 엔드포인트로 POST 요청을 보낸다', async () => {
            api.post.mockResolvedValue({ data: { id: 'file-id-001' } });

            const uploadData = {
                uploadId: 'upload-001',
                sessionId: 'session-001',
                fileName: 'test.xlsx',
                fileSize: 1024,
                s3Key: 'uploads/project-001/session-001/upload-001/test.xlsx',
            };

            const result = await uploadService.completeFileUpload('project-001', uploadData);

            expect(api.post).toHaveBeenCalledWith(
                '/api/projects/project-001/upload/files',
                uploadData
            );
            expect(result.id).toBe('file-id-001');
        });

        it('sessionId가 string이 아니면 에러를 throw한다', async () => {
            const uploadData = {
                uploadId: 'upload-001',
                sessionId: 12345,  // number 타입 - 잘못된 타입
                fileName: 'test.xlsx',
                fileSize: 1024,
                s3Key: 'uploads/key',
            };

            await expect(
                uploadService.completeFileUpload('project-001', uploadData)
            ).rejects.toThrow('sessionId는 String이어야 합니다');
        });

        it('sessionId가 null이면 에러를 throw한다', async () => {
            const uploadData = {
                uploadId: 'upload-001',
                sessionId: null,
                fileName: 'test.xlsx',
                fileSize: 1024,
                s3Key: 'uploads/key',
            };

            await expect(
                uploadService.completeFileUpload('project-001', uploadData)
            ).rejects.toThrow();
        });
    });

    // ========== getUploadStatus 테스트 ==========

    describe('getUploadStatus', () => {
        it('업로드 상태를 조회하고 전체 응답을 반환한다', async () => {
            // 변경된 응답 구조: { status, progress, processedRows, totalRows, fileName, error }
            const mockStatus = {
                data: {
                    status: 'PROCESSING',
                    progress: 45,
                    processedRows: 4500,
                    totalRows: 10000,
                    fileName: 'finance_data.xlsx',
                    error: '',
                }
            };
            api.get.mockResolvedValue(mockStatus);

            const result = await uploadService.getUploadStatus('project-001', 'upload-001');

            expect(api.get).toHaveBeenCalledWith(
                '/api/projects/project-001/upload/status/upload-001'
            );
            expect(result.status).toBe('PROCESSING');
            expect(result.progress).toBe(45);
            expect(result.processedRows).toBe(4500);
            expect(result.totalRows).toBe(10000);
        });

        it('COMPLETED 상태 응답을 올바르게 반환한다', async () => {
            api.get.mockResolvedValue({
                data: {
                    status: 'COMPLETED',
                    progress: 100,
                    processedRows: 10000,
                    totalRows: 10000,
                }
            });

            const result = await uploadService.getUploadStatus('project-001', 'upload-001');

            expect(result.status).toBe('COMPLETED');
            expect(result.progress).toBe(100);
        });

        it('FAILED 상태와 에러 메시지를 반환한다', async () => {
            api.get.mockResolvedValue({
                data: {
                    status: 'FAILED',
                    progress: 30,
                    error: '엑셀 파일 형식 오류',
                }
            });

            const result = await uploadService.getUploadStatus('project-001', 'upload-001');

            expect(result.status).toBe('FAILED');
            expect(result.error).toBe('엑셀 파일 형식 오류');
        });
    });

    // ========== MultiFileUploadPage 폴링 응답 구조 테스트 (프론트엔드 변경 반영) ==========
    // uploadProgress 상태가 단순 숫자에서 객체로 변경됨:
    // { percent: number, status: string, rowInfo: string, error: string }

    describe('uploadProgress 구조 변환 로직 검증', () => {
        it('getUploadStatus 응답으로 rowInfo를 올바르게 생성할 수 있다', async () => {
            api.get.mockResolvedValue({
                data: {
                    status: 'PROCESSING',
                    progress: 45,
                    processedRows: 4500,
                    totalRows: 10000,
                }
            });

            const status = await uploadService.getUploadStatus('project-001', 'upload-001');

            // MultiFileUploadPage의 로직 재현
            const processedRows = status.processedRows || 0;
            const totalRows = status.totalRows || 0;
            const rowInfo = totalRows > 0
                ? `${processedRows.toLocaleString()} / ${totalRows.toLocaleString()}행`
                : processedRows > 0 ? `${processedRows.toLocaleString()}행 처리 중` : '';

            expect(rowInfo).toContain('4,500');
            expect(rowInfo).toContain('10,000');
            expect(rowInfo).toContain('행');
        });

        it('totalRows가 0이고 processedRows > 0이면 "처리 중" 형식을 사용한다', async () => {
            api.get.mockResolvedValue({
                data: {
                    status: 'PROCESSING',
                    progress: 0,
                    processedRows: 1500,
                    totalRows: 0,
                }
            });

            const status = await uploadService.getUploadStatus('project-001', 'upload-001');

            const processedRows = status.processedRows || 0;
            const totalRows = status.totalRows || 0;
            const rowInfo = totalRows > 0
                ? `${processedRows.toLocaleString()} / ${totalRows.toLocaleString()}행`
                : processedRows > 0 ? `${processedRows.toLocaleString()}행 처리 중` : '';

            expect(rowInfo).toBe('1,500행 처리 중');
        });

        it('processedRows와 totalRows 모두 0이면 rowInfo는 빈 문자열이다', async () => {
            api.get.mockResolvedValue({
                data: { status: 'PROCESSING', progress: 0, processedRows: 0, totalRows: 0 }
            });

            const status = await uploadService.getUploadStatus('project-001', 'upload-001');

            const processedRows = status.processedRows || 0;
            const totalRows = status.totalRows || 0;
            const rowInfo = totalRows > 0
                ? `${processedRows.toLocaleString()} / ${totalRows.toLocaleString()}행`
                : processedRows > 0 ? `${processedRows.toLocaleString()}행 처리 중` : '';

            expect(rowInfo).toBe('');
        });
    });

    // ========== extractArray 헬퍼 테스트 (간접 테스트) ==========

    describe('getProjectFiles (extractArray 포함)', () => {
        it('배열 응답을 그대로 반환한다', async () => {
            const mockFiles = [{ id: '1', name: 'test.xlsx' }];
            api.get.mockResolvedValue({ data: mockFiles });

            const result = await uploadService.getProjectFiles('project-001');

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(1);
        });

        it('{ content: [...] } 형식 응답에서 배열을 추출한다', async () => {
            const mockFiles = [{ id: '1' }, { id: '2' }];
            api.get.mockResolvedValue({ data: { content: mockFiles } });

            const result = await uploadService.getProjectFiles('project-001');

            expect(result).toHaveLength(2);
        });

        it('{ data: [...] } 형식 응답에서 배열을 추출한다', async () => {
            const mockFiles = [{ id: '1' }];
            api.get.mockResolvedValue({ data: { data: mockFiles } });

            const result = await uploadService.getProjectFiles('project-001');

            expect(result).toHaveLength(1);
        });

        it('예상치 못한 응답 형식이면 빈 배열을 반환한다', async () => {
            api.get.mockResolvedValue({ data: { unknown: 'format' } });

            const result = await uploadService.getProjectFiles('project-001');

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(0);
        });
    });

    // ========== createSession 테스트 ==========

    describe('createSession', () => {
        it('세션 생성 API를 올바른 body로 호출한다', async () => {
            api.post.mockResolvedValue({ data: { id: 'session-001', sessionName: '테스트 세션' } });

            const result = await uploadService.createSession(
                'project-001', '테스트 세션', '홍길동', ['file-001', 'file-002']
            );

            expect(api.post).toHaveBeenCalledWith(
                '/api/projects/project-001/upload/sessions',
                {
                    projectId: 'project-001',
                    sessionName: '테스트 세션',
                    workerName: '홍길동',
                    fileIds: ['file-001', 'file-002'],
                }
            );
            expect(result.sessionName).toBe('테스트 세션');
        });
    });

    // ========== uploadFileWithProgress 테스트 ==========

    describe('uploadFileWithProgress', () => {
        it('전체 플로우를 순서대로 실행한다 (presignedUrl → S3 업로드 → completeFileUpload → 상태 폴링)', async () => {
            api.post.mockResolvedValueOnce({
                data: {
                    presignedUrl: 'https://s3.amazonaws.com/key',
                    uploadId: 'upload-001',
                    sessionId: 'session-001',
                    s3Key: 'uploads/key',
                }
            });
            api.post.mockResolvedValueOnce({ data: { id: 'file-id-001' } });
            api.get.mockResolvedValue({
                data: { status: 'COMPLETED', progress: 100 }
            });

            const mockXHR = {
                upload: { addEventListener: vi.fn() },
                addEventListener: vi.fn(),
                open: vi.fn(),
                setRequestHeader: vi.fn(),
                send: vi.fn(),
                status: 200,
            };
            mockXHR.addEventListener.mockImplementation((event, callback) => {
                if (event === 'load') callback();
            });
            vi.stubGlobal('XMLHttpRequest', vi.fn(() => mockXHR));

            const file = new File(['content'], 'test.xlsx');
            const onProgress = vi.fn();

            const result = await uploadService.uploadFileWithProgress('project-001', file, onProgress);

            expect(result.uploadId).toBe('upload-001');
            expect(result.sessionId).toBe('session-001');
            expect(result.status).toBe('COMPLETED');
            expect(result.fileId).toBe('file-id-001');
            expect(onProgress).toHaveBeenCalled();
        });

        it('Lambda 처리 실패(FAILED) 시 에러를 throw한다', async () => {
            api.post.mockResolvedValueOnce({
                data: {
                    presignedUrl: 'https://s3.amazonaws.com/key',
                    uploadId: 'upload-001',
                    sessionId: 'session-001',
                    s3Key: 'uploads/key',
                }
            });
            api.post.mockResolvedValueOnce({ data: { id: 'file-id-001' } });
            api.get.mockResolvedValue({
                data: { status: 'FAILED', error: '파싱 오류 발생' }
            });

            const mockXHR = {
                upload: { addEventListener: vi.fn() },
                addEventListener: vi.fn(),
                open: vi.fn(),
                setRequestHeader: vi.fn(),
                send: vi.fn(),
                status: 200,
            };
            mockXHR.addEventListener.mockImplementation((event, callback) => {
                if (event === 'load') callback();
            });
            vi.stubGlobal('XMLHttpRequest', vi.fn(() => mockXHR));

            const file = new File(['content'], 'test.xlsx');

            await expect(
                uploadService.uploadFileWithProgress('project-001', file, vi.fn())
            ).rejects.toThrow('파싱 오류 발생');
        });
    });
});
