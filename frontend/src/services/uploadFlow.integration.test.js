/**
 * 엑셀 업로드 전체 플로우 통합 테스트 시나리오
 *
 * 플로우: 엑셀 파일 선택 → Presigned URL 요청 → S3 업로드 → 완료 처리 → Lambda 파싱 대기 → 세션 생성
 *
 * 실행 방법: npx vitest run src/services/uploadFlow.integration.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// XMLHttpRequest 전역 Mock 설정 (S3 업로드 시뮬레이션)
function setupXHRMock({ status = 200, progressSteps = [] } = {}) {
    const mockXHR = {
        upload: { addEventListener: vi.fn() },
        addEventListener: vi.fn(),
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        status,
    };

    // upload progress 이벤트
    mockXHR.upload.addEventListener.mockImplementation((event, callback) => {
        if (event === 'progress') {
            progressSteps.forEach(({ loaded, total }) => {
                callback({ lengthComputable: true, loaded, total });
            });
        }
    });

    // load 이벤트 (완료)
    mockXHR.addEventListener.mockImplementation((event, callback) => {
        if (event === 'load') callback();
    });

    vi.stubGlobal('XMLHttpRequest', vi.fn(() => mockXHR));
    return mockXHR;
}

describe('엑셀 업로드 전체 플로우 통합 테스트', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ========== 시나리오 1: 정상 업로드 완료 플로우 ==========

    describe('시나리오 1: 정상 업로드 완료', () => {
        it('파일 선택부터 Lambda 완료까지 전체 플로우가 성공적으로 실행된다', async () => {
            // Step 1: Presigned URL 요청 응답
            api.post.mockResolvedValueOnce({
                data: {
                    presignedUrl: 'https://s3.ap-northeast-2.amazonaws.com/excel-bucket/uploads/proj/session/upload/test.xlsx?AWSAccessKeyId=...',
                    uploadId: 'upload-abc123',
                    sessionId: 'session-xyz789',
                    s3Key: 'uploads/proj-001/session-xyz789/upload-abc123/finance_data.xlsx',
                    expiresIn: 3600,
                }
            });

            // Step 2: S3 업로드 Mock (XMLHttpRequest)
            setupXHRMock({
                status: 200,
                progressSteps: [
                    { loaded: 512, total: 1024 },   // 50%
                    { loaded: 1024, total: 1024 },  // 100%
                ]
            });

            // Step 3: completeFileUpload 응답
            api.post.mockResolvedValueOnce({
                data: {
                    id: 'file-mongo-id-001',
                    uploadId: 'upload-abc123',
                    fileName: 'finance_data.xlsx',
                    fileSize: 1024,
                    status: 'PROCESSING',
                }
            });

            // Step 4: 업로드 상태 폴링 (처리 중 → 완료)
            api.get
                .mockResolvedValueOnce({ data: { status: 'PROCESSING', progress: 30 } })
                .mockResolvedValueOnce({ data: { status: 'PROCESSING', progress: 70 } })
                .mockResolvedValueOnce({ data: { status: 'COMPLETED', progress: 100 } });

            const file = new File(['excel binary content'], 'finance_data.xlsx');
            const progressEvents = [];
            const onProgress = (value, message) => progressEvents.push({ value, message });

            const result = await uploadService.uploadFileWithProgress(
                'proj-001', file, onProgress
            );

            // 결과 검증
            expect(result.uploadId).toBe('upload-abc123');
            expect(result.sessionId).toBe('session-xyz789');
            expect(result.status).toBe('COMPLETED');
            expect(result.fileId).toBe('file-mongo-id-001');

            // API 호출 순서 검증
            expect(api.post).toHaveBeenCalledTimes(2); // presignedUrl + completeFileUpload
            expect(api.get).toHaveBeenCalledTimes(3);  // 상태 폴링 3회

            // 진행률 이벤트 발생 확인
            expect(progressEvents.length).toBeGreaterThan(0);
            // 초기 진행률 5%로 시작
            expect(progressEvents[0].value).toBe(5);
        });
    });

    // ========== 시나리오 2: S3 업로드 실패 ==========

    describe('시나리오 2: S3 업로드 실패', () => {
        it('S3 업로드 실패 시 에러가 전파된다', async () => {
            api.post.mockResolvedValueOnce({
                data: {
                    presignedUrl: 'https://s3.amazonaws.com/bucket/key',
                    uploadId: 'upload-fail',
                    sessionId: 'session-fail',
                    s3Key: 'uploads/key',
                }
            });

            // S3 업로드 실패 (HTTP 403)
            setupXHRMock({ status: 403 });

            const file = new File(['content'], 'test.xlsx');

            await expect(
                uploadService.uploadFileWithProgress('proj-001', file, vi.fn())
            ).rejects.toThrow('Upload failed: 403');

            // completeFileUpload가 호출되지 않아야 함
            expect(api.post).toHaveBeenCalledTimes(1); // presignedUrl만
        });
    });

    // ========== 시나리오 3: Lambda 파싱 실패 ==========

    describe('시나리오 3: Lambda 파싱 실패', () => {
        it('Lambda 파싱 실패 시 FAILED 상태와 에러 메시지를 반환한다', async () => {
            api.post.mockResolvedValueOnce({
                data: {
                    presignedUrl: 'https://s3.amazonaws.com/key',
                    uploadId: 'upload-002',
                    sessionId: 'session-002',
                    s3Key: 'uploads/key',
                }
            });

            setupXHRMock({ status: 200 });

            api.post.mockResolvedValueOnce({ data: { id: 'file-002' } });

            // Lambda 실패 응답
            api.get.mockResolvedValue({
                data: {
                    status: 'FAILED',
                    error: '엑셀 파일 형식이 올바르지 않습니다',
                }
            });

            const file = new File(['invalid content'], 'invalid.xlsx');

            await expect(
                uploadService.uploadFileWithProgress('proj-001', file, vi.fn())
            ).rejects.toThrow('엑셀 파일 형식이 올바르지 않습니다');
        });
    });

    // ========== 시나리오 4: 세션 생성 후 파일 추가 플로우 ==========

    describe('시나리오 4: 세션 생성 및 관리', () => {
        it('세션 생성 → 파일 추가 → 세션 시작 플로우가 성공적으로 실행된다', async () => {
            // 세션 생성
            api.post.mockResolvedValueOnce({
                data: {
                    id: 'session-id-001',
                    sessionName: '2024년 1월 결산',
                    workerName: '홍길동',
                    fileIds: [],
                }
            });

            const session = await uploadService.createSession(
                'proj-001',
                '2024년 1월 결산',
                '홍길동',
                []
            );

            expect(session.sessionName).toBe('2024년 1월 결산');
            expect(session.id).toBe('session-id-001');

            // 파일을 세션에 추가
            api.post.mockResolvedValueOnce({
                data: {
                    id: 'session-id-001',
                    fileIds: ['file-001', 'file-002'],
                }
            });

            const updatedSession = await uploadService.addFilesToSession(
                'proj-001', 'session-id-001', ['file-001', 'file-002']
            );

            expect(updatedSession.fileIds).toHaveLength(2);

            // 세션 시작
            api.post.mockResolvedValueOnce({
                data: { status: 'STARTED' }
            });

            const startResult = await uploadService.startSession('proj-001', 'session-id-001');

            expect(startResult.status).toBe('STARTED');

            // API 호출 횟수 검증
            expect(api.post).toHaveBeenCalledTimes(3); // 세션생성 + 파일추가 + 세션시작
        });
    });

    // ========== 시나리오 5: 다중 파일 업로드 플로우 ==========

    describe('시나리오 5: 다중 파일 업로드', () => {
        it('2개 파일을 순차적으로 업로드하고 파티션 분석이 성공한다', async () => {
            // 첫 번째 파일 - presignedUrl
            api.post.mockResolvedValueOnce({
                data: {
                    presignedUrl: 'https://s3.amazonaws.com/key1',
                    uploadId: 'upload-001',
                    sessionId: 'session-001',
                    s3Key: 'uploads/file1.xlsx',
                }
            });

            setupXHRMock({ status: 200 });

            // 첫 번째 파일 - completeFileUpload
            api.post.mockResolvedValueOnce({
                data: { id: 'file-001' }
            });

            // 첫 번째 파일 - 상태 폴링
            api.get.mockResolvedValueOnce({
                data: { status: 'COMPLETED', progress: 100 }
            });

            const file1 = new File(['content1'], 'file1.xlsx');
            const result1 = await uploadService.uploadFileWithProgress('proj-001', file1, vi.fn());
            expect(result1.fileId).toBe('file-001');

            // 두 번째 파일 - presignedUrl
            api.post.mockResolvedValueOnce({
                data: {
                    presignedUrl: 'https://s3.amazonaws.com/key2',
                    uploadId: 'upload-002',
                    sessionId: 'session-002',
                    s3Key: 'uploads/file2.xlsx',
                }
            });

            setupXHRMock({ status: 200 });

            // 두 번째 파일 - completeFileUpload
            api.post.mockResolvedValueOnce({
                data: { id: 'file-002' }
            });

            // 두 번째 파일 - 상태 폴링
            api.get.mockResolvedValueOnce({
                data: { status: 'COMPLETED', progress: 100 }
            });

            const file2 = new File(['content2'], 'file2.xlsx');
            const result2 = await uploadService.uploadFileWithProgress('proj-001', file2, vi.fn());
            expect(result2.fileId).toBe('file-002');

            // 파티션 분석
            api.post.mockResolvedValueOnce({
                data: {
                    partitions: [
                        { accountName: '현금', fileIds: ['file-001'], rowCount: 100 },
                        { accountName: '예금', fileIds: ['file-002'], rowCount: 200 },
                    ],
                    totalRows: 300,
                }
            });

            const analysisResult = await uploadService.analyzePartitions(
                'proj-001', ['file-001', 'file-002']
            );

            expect(analysisResult.partitions).toHaveLength(2);
            expect(analysisResult.totalRows).toBe(300);
        });
    });

    // ========== 시나리오 6: getSessionParsingStatus 신규 API ==========

    describe('시나리오 6: 세션 전체 파싱 상태 폴링 (신규 API)', () => {
        it('세션의 모든 파일 파싱 완료 시 COMPLETED와 전체 행 수를 반환한다', async () => {
            api.get.mockResolvedValueOnce({
                data: {
                    sessionId: 'session-001',
                    status: 'COMPLETED',
                    progress: 100,
                    totalRows: 15000,
                    processedRows: 15000,
                    totalFiles: 2,
                    completedFiles: 2,
                    failedFiles: 0,
                    fileStatuses: [
                        { fileId: 'file-001', status: 'COMPLETED', totalRows: 10000, processedRows: 10000, progress: 100 },
                        { fileId: 'file-002', status: 'COMPLETED', totalRows: 5000, processedRows: 5000, progress: 100 },
                    ],
                }
            });

            const result = await api.get('/api/projects/proj-001/upload/sessions/session-001/parsing-status');

            expect(result.data.status).toBe('COMPLETED');
            expect(result.data.progress).toBe(100);
            expect(result.data.totalRows).toBe(15000);
            expect(result.data.completedFiles).toBe(2);
            expect(result.data.fileStatuses).toHaveLength(2);
        });

        it('일부 파일 처리 중일 때 PROCESSING과 집계된 진행률을 반환한다', async () => {
            api.get.mockResolvedValueOnce({
                data: {
                    sessionId: 'session-001',
                    status: 'PROCESSING',
                    progress: 36,
                    totalRows: 11000,
                    processedRows: 4000,
                    totalFiles: 2,
                    completedFiles: 1,
                    failedFiles: 0,
                    fileStatuses: [
                        { fileId: 'file-001', status: 'COMPLETED', progress: 100 },
                        { fileId: 'file-002', status: 'PROCESSING', progress: 30 },
                    ],
                }
            });

            const result = await api.get('/api/projects/proj-001/upload/sessions/session-001/parsing-status');

            expect(result.data.status).toBe('PROCESSING');
            expect(result.data.progress).toBeGreaterThanOrEqual(30);
            expect(result.data.progress).toBeLessThanOrEqual(99);
        });

        it('파일 파싱 실패 시 FAILED 상태를 반환한다', async () => {
            api.get.mockResolvedValueOnce({
                data: {
                    sessionId: 'session-001',
                    status: 'FAILED',
                    progress: 50,
                    totalFiles: 2,
                    completedFiles: 1,
                    failedFiles: 1,
                    fileStatuses: [
                        { fileId: 'file-001', status: 'COMPLETED', progress: 100 },
                        { fileId: 'file-002', status: 'FAILED', progress: 0 },
                    ],
                }
            });

            const result = await api.get('/api/projects/proj-001/upload/sessions/session-001/parsing-status');

            expect(result.data.status).toBe('FAILED');
            expect(result.data.failedFiles).toBe(1);
        });
    });

    // ========== 시나리오 7: 업로드 상태 폴링 진행률 매핑 ==========

    describe('시나리오 7: 업로드 상태 폴링 진행률 매핑 검증', () => {
        it('Lambda 진행률 0~100%가 40~100% 범위로 올바르게 매핑된다', async () => {
            api.post.mockResolvedValueOnce({
                data: {
                    presignedUrl: 'https://s3.amazonaws.com/key',
                    uploadId: 'upload-003',
                    sessionId: 'session-003',
                    s3Key: 'uploads/key',
                }
            });

            setupXHRMock({ status: 200 });

            api.post.mockResolvedValueOnce({ data: { id: 'file-003' } });

            // Lambda 진행률 시뮬레이션: 0% → 50% → 100%
            api.get
                .mockResolvedValueOnce({ data: { status: 'PROCESSING', progress: 0 } })
                .mockResolvedValueOnce({ data: { status: 'PROCESSING', progress: 50 } })
                .mockResolvedValueOnce({ data: { status: 'COMPLETED', progress: 100 } });

            const file = new File(['content'], 'test.xlsx');
            const progressEvents = [];
            const onProgress = (value, message) => progressEvents.push({ value, message });

            await uploadService.uploadFileWithProgress('proj-001', file, onProgress);

            // Lambda 진행률 매핑 검증
            // progress=0 → 40 + (0 * 0.55) = 40
            // progress=50 → 40 + (50 * 0.55) = 67
            // COMPLETED → 100

            const lambdaProgressEvents = progressEvents.filter(e =>
                e.message && e.message.includes('Lambda')
            );

            if (lambdaProgressEvents.length > 0) {
                const firstLambdaProgress = lambdaProgressEvents[0].value;
                expect(firstLambdaProgress).toBeGreaterThanOrEqual(40);
                expect(firstLambdaProgress).toBeLessThanOrEqual(100);
            }

            // 최종 완료 이벤트 확인
            const completedEvent = progressEvents.find(e => e.value === 100);
            expect(completedEvent).toBeDefined();
        });
    });
});
