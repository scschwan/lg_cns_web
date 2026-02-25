// frontend/src/pages/upload/DashboardUploadPage.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Upload,
    Folder,
    FolderOpen,
    Trash2,
    Loader2,
    BarChart3,
    ArrowRight,
    AlertCircle,
    CheckCircle2,
    RefreshCw,
    Lock,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';

import projectService from '../../services/projectService';
import uploadService from '../../services/uploadService';
import costReductionService from '../../services/costReductionService';
import { useUploadPageLock } from '../../hooks/useUploadPageLock';
import ProgressDialog from '../../components/common/ProgressDialog';

/**
 * 가로 스크롤 동기화 테이블 래퍼
 */
function ScrollSyncTable({ children, minWidth = '1200px', maxHeight = '500px' }) {
    return (
        <div className="border-t overflow-auto" style={{ maxHeight }}>
            <div style={{ minWidth }}>
                {children}
            </div>
        </div>
    );
}

/**
 * 대시보드 프로젝트 전용 업로드 페이지
 *
 * - 파일 업로드 → 세션 자동 생성 (파일 목록 없음, 바로 세션 테이블에 표시)
 * - 세션 테이블: 대계정컬럼, 금액컬럼, 공급업체명, 코스트센터명 셀렉트 박스
 * - 클러스터/세부클러스터 컬럼 자동 감지
 * - 대시보드 데이터 생성 → 프로젝트 완료 → 대시보드 진입
 */
function DashboardUploadPage() {
    const { projectId } = useParams();
    const navigate = useNavigate();

    // 편집자 잠금: 다른 편집자가 사용 중이면 진입 차단
    const { isEditor: isPageEditor, editorInfo, loading: lockLoading } = useUploadPageLock(projectId);

    // 프로젝트 & 세션
    const [project, setProject] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [selectedSessions, setSelectedSessions] = useState([]);

    // 컬럼 매핑 (sessionId → { accountColumn, amountColumn, supplierColumn, costCenterColumn })
    const [columnMappings, setColumnMappings] = useState({});

    // 대시보드 데이터 생성 상태
    const [generationStatus, setGenerationStatus] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // 업로드 진행
    const [progressDialogOpen, setProgressDialogOpen] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    const [progressValue, setProgressValue] = useState(0);

    // 프로젝트 완료 다이얼로그
    const [completeDialogOpen, setCompleteDialogOpen] = useState(false);

    // 세션 삭제 확인 다이얼로그
    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({ open: false, sessionIds: [], hasDashboard: false });

    // 엑셀 데이터 재분석 상태
    const [isReanalyzing, setIsReanalyzing] = useState(false);
    const [reanalyzeConfirmOpen, setReanalyzeConfirmOpen] = useState(false);

    // 메시지 다이얼로그
    const [msgDialog, setMsgDialog] = useState({ open: false, type: 'error', title: '', message: '' });
    const showMessage = (type, title, message) => setMsgDialog({ open: true, type, title, message });
    const showError = (title, message) => showMessage('error', title, message);
    const showSuccess = (title, message) => showMessage('success', title, message);
    const getErrorMsg = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

    // 뷰어 권한
    const myRole = project?.myRole || 'VIEWER';
    const isViewer = myRole === 'VIEWER';

    // Lambda 처리 폴링
    const pollingRef = useRef(null);

    // ===== 유틸 (useEffect보다 먼저 선언) =====
    const getSessionColumns = (session) => {
        if (session.uploadedFiles && session.uploadedFiles.length > 0) {
            return session.uploadedFiles[0].detectedColumns || [];
        }
        return [];
    };

    // ===== 컬럼 자동 감지 =====
    const autoDetectColumns = (columns) => {
        const find = (patterns) => columns.find(c =>
            patterns.some(p => c.toLowerCase().includes(p))
        ) || '';
        return {
            accountColumn: find(['대계정', '계정', 'account', '대분류']),
            amountColumn: find(['금액', 'amount', '비용', '원가', 'money']),
            supplierColumn: find(['공급업체', 'supplier', '업체', '거래처']),
            costCenterColumn: find(['코스트센터', 'cost center', 'cc', '부서', 'department']),
        };
    };

    // 클러스터/세부클러스터 자동 감지 (백엔드 전송용, UI에 노출하지 않음)
    const autoDetectClusterColumns = (columns) => {
        const find = (patterns) => columns.find(c =>
            patterns.some(p => c.toLowerCase().includes(p))
        ) || '';
        return {
            clusterColumn: find(['클러스터', 'cluster', '분류']),
            subClusterColumn: find(['세부클러스터', '세부', 'sub_cluster', 'subcluster', '소분류']),
        };
    };

    // ===== 데이터 로드 =====
    const loadProject = async () => {
        try {
            const data = await projectService.getProject(projectId);
            setProject(data);
        } catch (error) {
            console.error('프로젝트 로드 실패:', error);
        }
    };

    const loadSessions = async () => {
        setSessionsLoading(true);
        try {
            const data = await uploadService.getSessions(projectId);
            setSessions(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('세션 로드 실패:', error);
            setSessions([]);
        } finally {
            setSessionsLoading(false);
        }
    };

    // ===== 초기 로드 =====
    useEffect(() => {
        loadProject();
        loadSessions();
    }, [projectId]);

    // 페이지 로드 시 대시보드 생성 상태 확인
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const status = await costReductionService.getDashboardGenerationStatus(projectId);
                if (status.status === 'PROCESSING') {
                    setIsGenerating(true);
                    setGenerationStatus(status);
                    pollGenerationStatus();
                } else if (status.status === 'COMPLETED' || status.status === 'COMPLETED_WITH_ERRORS') {
                    setGenerationStatus(status);
                }
            } catch (e) {
                // 상태 없으면 무시
            }
        };
        checkStatus();
    }, [projectId]);

    // ===== Lambda 처리 상태 폴링 (파일 파싱 완료 대기) =====
    useEffect(() => {
        const processingSessions = sessions.filter(s => getSessionColumns(s).length === 0);

        if (processingSessions.length === 0) {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            return;
        }

        pollingRef.current = setInterval(async () => {
            try {
                const data = await uploadService.getSessions(projectId);
                const updated = Array.isArray(data) ? data : [];
                setSessions(updated);

                const stillProcessing = updated.filter(s => getSessionColumns(s).length === 0);
                if (stillProcessing.length === 0 && pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }
            } catch (e) {
                // 무시
            }
        }, 5000);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [sessions.map(s => s.sessionId + (getSessionColumns(s).length || 0)).join(',')]);

    // 세션 로드 시 자동 매핑
    useEffect(() => {
        if (sessions.length === 0) return;
        setColumnMappings(prev => {
            const updated = { ...prev };
            for (const session of sessions) {
                if (updated[session.sessionId]) continue;
                const cols = getSessionColumns(session);
                if (cols.length === 0) continue;
                updated[session.sessionId] = autoDetectColumns(cols);
            }
            return updated;
        });
    }, [sessions]);

    // ===== 파일 업로드 → 세션 자동 생성 =====
    const handleFileUpload = async (event) => {
        if (!event.target.files || event.target.files.length === 0) {
            showError('파일 선택 필요', '파일을 선택해주세요.');
            return;
        }

        const selectedFiles = Array.from(event.target.files);
        const excelFiles = selectedFiles.filter(
            (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
        );

        if (excelFiles.length === 0) {
            showError('파일 형식 오류', 'Excel 파일(.xlsx, .xls)을 선택해주세요.');
            return;
        }

        setProgressDialogOpen(true);
        setProgressValue(0);
        setProgressMessage('파일 업로드 시작...');

        try {
            for (let i = 0; i < excelFiles.length; i++) {
                const file = excelFiles[i];

                setProgressValue(((i + 1) / excelFiles.length) * 80);
                setProgressMessage(`파일 업로드 중... (${i + 1}/${excelFiles.length}) - ${file.name}`);

                const { presignedUrl, uploadId, sessionId, s3Key } =
                    await uploadService.getPresignedUrl(projectId, file.name, file.size);

                await uploadService.uploadToS3(presignedUrl, file);

                await uploadService.completeFileUpload(projectId, {
                    uploadId,
                    sessionId,
                    fileName: file.name,
                    fileSize: file.size,
                    s3Key,
                });
            }

            setProgressValue(100);
            setProgressMessage('완료');
            setTimeout(() => setProgressDialogOpen(false), 500);

            showSuccess('업로드 완료', `${excelFiles.length}개의 파일이 업로드되었습니다. 세션이 자동 생성됩니다.`);
            loadSessions();

        } catch (error) {
            console.error('파일 업로드 실패:', error);
            showError('업로드 실패', getErrorMsg(error, '파일 업로드 중 오류가 발생했습니다.'));
            setProgressDialogOpen(false);
        }

        event.target.value = '';
    };

    // ===== 컬럼 매핑 변경 =====
    const handleColumnMapping = (sessionId, field, value) => {
        setColumnMappings(prev => ({
            ...prev,
            [sessionId]: {
                ...prev[sessionId],
                [field]: value,
            },
        }));
    };

    // ===== 세션 삭제 =====
    const handleDeleteSessions = () => {
        if (selectedSessions.length === 0) {
            showError('선택 필요', '삭제할 세션을 선택해주세요.');
            return;
        }
        const hasDashboard = generationStatus?.status === 'COMPLETED' || generationStatus?.status === 'COMPLETED_WITH_ERRORS';
        setDeleteConfirmDialog({ open: true, sessionIds: [...selectedSessions], hasDashboard });
    };

    const handleDeleteSingleSession = (sessionId) => {
        const hasDashboard = generationStatus?.status === 'COMPLETED' || generationStatus?.status === 'COMPLETED_WITH_ERRORS';
        setDeleteConfirmDialog({ open: true, sessionIds: [sessionId], hasDashboard });
    };

    const executeDeleteSessions = async () => {
        const { sessionIds } = deleteConfirmDialog;
        setDeleteConfirmDialog({ open: false, sessionIds: [] });

        // ★ UI에서 먼저 삭제 대상 세션을 제거 (Optimistic UI)
        const previousSessions = [...sessions];
        const sessionIdSet = new Set(sessionIds);
        setSessions(prev => prev.filter(s => !sessionIdSet.has(s.sessionId)));
        setSelectedSessions(prev => prev.filter(id => !sessionIdSet.has(id)));

        try {
            await uploadService.deleteSessions(projectId, sessionIds);
            loadProject();
            showSuccess('삭제 완료', '세션이 삭제되었습니다.');
        } catch (error) {
            console.error('세션 삭제 실패:', error);
            // ★ 실패 시 이전 상태로 복원
            setSessions(previousSessions);
            showError('삭제 실패', getErrorMsg(error, '세션 삭제 중 오류가 발생했습니다.'));
        }
    };

    // ===== 대시보드 데이터 생성 =====
    const handleStartDashboardGeneration = async () => {
        if (sessions.length === 0) {
            showError('세션 없음', '데이터를 생성할 세션이 없습니다.');
            return;
        }

        // 각 세션별로 사용자 선택 + 자동 감지 컬럼 조합
        const sessionsConfig = sessions.map(session => {
            const mapping = columnMappings[session.sessionId] || {};
            const cols = getSessionColumns(session);
            const autoCluster = autoDetectClusterColumns(cols);

            return {
                sessionId: session.sessionId,
                accountName: session.sessionName || '',
                accountColumn: mapping.accountColumn || '',
                clusterColumn: autoCluster.clusterColumn || '',
                subClusterColumn: autoCluster.subClusterColumn || '',
                amountColumn: mapping.amountColumn || '',
                supplierColumn: mapping.supplierColumn || '',
                costCenterColumn: mapping.costCenterColumn || '',
            };
        });

        // 필수 컬럼 검증: 대계정(accountColumn), 클러스터(clusterColumn), 금액(amountColumn)
        const invalid = sessionsConfig.filter(s => !s.accountColumn || !s.clusterColumn || !s.amountColumn);
        if (invalid.length > 0) {
            showError('매핑 필요', '모든 세션에 대계정컬럼, 클러스터컬럼, 금액컬럼을 설정해주세요.');
            return;
        }

        try {
            setIsGenerating(true);
            setGenerationStatus({ status: 'PROCESSING', totalSessions: sessions.length, completedSessions: 0 });
            await costReductionService.startDashboardGeneration(projectId, sessionsConfig);
            pollGenerationStatus();
        } catch (error) {
            showError('생성 실패', getErrorMsg(error, '대시보드 데이터 생성 시작에 실패했습니다.'));
            setIsGenerating(false);
            setGenerationStatus(null);
        }
    };

    const pollGenerationStatus = () => {
        const poll = async () => {
            try {
                const status = await costReductionService.getDashboardGenerationStatus(projectId);
                setGenerationStatus(status);

                if (status.status === 'COMPLETED' || status.status === 'COMPLETED_WITH_ERRORS') {
                    setIsGenerating(false);
                    loadSessions();
                    if (status.status === 'COMPLETED') {
                        showSuccess('생성 완료', '대시보드 데이터가 성공적으로 생성되었습니다.');
                    } else {
                        showError('부분 완료', `일부 세션에서 오류가 발생했습니다:\n${status.errors?.join('\n')}`);
                    }
                    return;
                }

                if (status.status === 'FAILED') {
                    setIsGenerating(false);
                    showError('생성 실패', status.errors?.join('\n') || '알 수 없는 오류');
                    return;
                }

                setTimeout(poll, 2000);
            } catch (error) {
                console.error('상태 조회 실패:', error);
                setTimeout(poll, 3000);
            }
        };

        setTimeout(poll, 1000);
    };

    // ===== 프로젝트 완료 =====
    const handleProjectComplete = async () => {
        try {
            await projectService.completeProject(projectId);
            setCompleteDialogOpen(false);
            loadProject();
            loadSessions();
            showSuccess('프로젝트 완료', '프로젝트가 완료 처리되었습니다.');
        } catch (error) {
            console.error('프로젝트 완료 실패:', error);
            showError('완료 처리 실패', getErrorMsg(error, '프로젝트 완료 처리에 실패했습니다.'));
        }
    };

    // ===== 엑셀 데이터 재분석 =====
    const handleReanalyzeExcelData = async () => {
        if (selectedSessions.length === 0) {
            showError('선택 필요', '재분석할 세션을 선택해주세요.');
            return;
        }
        setReanalyzeConfirmOpen(true);
    };

    const executeReanalyze = async () => {
        setReanalyzeConfirmOpen(false);
        setIsReanalyzing(true);
        setProgressDialogOpen(true);
        setProgressValue(10);
        setProgressMessage('엑셀 데이터 재분석 요청 중...');

        try {
            const result = await uploadService.reanalyzeExcelData(projectId, {
                sessionIds: selectedSessions,
            });

            setProgressValue(30);
            setProgressMessage(`${result.totalFilesProcessed}개 파일 재분석 시작됨. Lambda 처리 대기 중...`);

            // 세션 목록 갱신 (PROCESSING 상태로 변경된 파일이 폴링에 잡히도록)
            await loadSessions();

            setProgressValue(100);
            setProgressMessage('재분석이 시작되었습니다.');
            setTimeout(() => {
                setProgressDialogOpen(false);
                setIsReanalyzing(false);
                showSuccess('재분석 시작', result.message);
            }, 500);

        } catch (error) {
            console.error('엑셀 데이터 재분석 실패:', error);
            setProgressDialogOpen(false);
            setIsReanalyzing(false);
            showError('재분석 실패', getErrorMsg(error, '엑셀 데이터 재분석 중 오류가 발생했습니다.'));
        }
    };

    // ===== 파생 상태 =====
    const canEnterDashboard = project?.isCompleted === true;
    const isDashboardGenerated = (
        generationStatus?.status === 'COMPLETED' ||
        generationStatus?.status === 'COMPLETED_WITH_ERRORS' ||
        (sessions.length > 0 && sessions.every(s => s.isCompleted))
    );
    const dashboardProcessingCount = sessions.filter(s => getSessionColumns(s).length === 0).length;

    // 셀렉트 박스 렌더 헬퍼
    const renderColumnSelect = (session, cols, fieldName, placeholder, isSessionProcessing) => {
        const mapping = columnMappings[session.sessionId] || {};
        if (isSessionProcessing) {
            return <span className="text-xs text-amber-600">처리 중...</span>;
        }
        return (
            <Select
                value={mapping[fieldName] || ''}
                onValueChange={(v) => handleColumnMapping(session.sessionId, fieldName, v)}
                disabled={isGenerating || isViewer}
            >
                <SelectTrigger className="h-8"><SelectValue placeholder={placeholder} /></SelectTrigger>
                <SelectContent>
                    {cols.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                </SelectContent>
            </Select>
        );
    };

    // ===== 렌더 =====

    // 잠금 로딩 중
    if (lockLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">접속 확인 중...</p>
                </div>
            </div>
        );
    }

    // 다른 편집자가 사용 중 → 진입 차단
    if (!isPageEditor) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                            <Lock className="h-8 w-8 text-amber-600" />
                        </div>
                        <CardTitle className="text-xl">편집 중인 사용자가 있습니다</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                        <p className="text-muted-foreground">
                            현재 <span className="font-semibold text-foreground">{editorInfo?.editorUserName || '다른 사용자'}</span>님이
                            이 프로젝트의 업로드 페이지를 편집 중입니다.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            동시 편집으로 인한 데이터 충돌을 방지하기 위해 접근이 제한됩니다.
                            편집자의 작업이 완료되면 자동으로 접근 가능합니다.
                        </p>
                        <div className="pt-4">
                            <Button onClick={() => navigate('/projects')} variant="outline" className="mr-2">
                                프로젝트 목록으로
                            </Button>
                            <Button onClick={() => window.location.reload()}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                다시 확인
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 py-6 max-w-[98vw]">
                {/* Breadcrumb */}
                <Breadcrumb className="mb-6">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink
                                onClick={() => navigate('/projects')}
                                className="flex items-center gap-1 cursor-pointer hover:text-primary"
                            >
                                <Folder className="h-4 w-4" />
                                내 프로젝트
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>{project?.projectName}</BreadcrumbPage>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>대시보드 업로드</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>

                {/* Header Card */}
                <Card className="mb-6">
                    <CardHeader>
                        <div className="flex items-start justify-between">
                            <div>
                                <CardTitle className="text-2xl">
                                    <span className="flex items-center gap-2">
                                        <BarChart3 className="h-6 w-6 text-emerald-600" />
                                        대시보드 프로젝트 - 파일 업로드
                                    </span>
                                </CardTitle>
                                <p className="text-sm text-muted-foreground mt-2">
                                    클러스터링된 Excel 파일을 업로드하면 세션이 자동 생성됩니다.
                                    각 세션의 대계정, 금액, 공급업체, 코스트센터 컬럼을 지정한 후 대시보드 데이터를 생성하세요.
                                </p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-3">
                            <Button asChild disabled={isViewer || isGenerating}>
                                <label className={`cursor-pointer ${(isViewer || isGenerating) ? 'pointer-events-none opacity-50' : ''}`}>
                                    <Upload className="h-4 w-4 mr-2" />
                                    Excel 파일 업로드
                                    <input
                                        type="file"
                                        hidden
                                        multiple
                                        accept=".xlsx,.xls"
                                        onChange={handleFileUpload}
                                        disabled={isViewer || isGenerating}
                                    />
                                </label>
                            </Button>
                            {isViewer && (
                                <span className="text-xs text-muted-foreground self-center ml-2">뷰어 권한: 조회만 가능</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 세션 목록 */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg">세션 목록</CardTitle>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={handleReanalyzeExcelData}
                                        variant="outline"
                                        size="sm"
                                        disabled={selectedSessions.length === 0 || isViewer || isGenerating || isReanalyzing}
                                    >
                                        {isReanalyzing ? (
                                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-4 w-4 mr-1" />
                                        )}
                                        엑셀 데이터 재분석
                                    </Button>
                                    <Button
                                        onClick={handleDeleteSessions}
                                        variant="destructive"
                                        size="sm"
                                        disabled={selectedSessions.length === 0 || isViewer || isGenerating}
                                    >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        세션 삭제
                                    </Button>
                                    <Button
                                        onClick={handleStartDashboardGeneration}
                                        size="sm"
                                        disabled={sessions.length === 0 || isViewer || isGenerating || dashboardProcessingCount > 0}
                                        className="bg-emerald-600 hover:bg-emerald-700"
                                    >
                                        {isGenerating ? (
                                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                        ) : (
                                            <BarChart3 className="h-4 w-4 mr-1" />
                                        )}
                                        대시보드 데이터 생성
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {/* 생성 진행 상태 */}
                            {isGenerating && generationStatus && (
                                <div className="px-6 py-3 bg-emerald-50 border-b flex items-center gap-3">
                                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                                    <span className="text-sm text-emerald-700">
                                        대시보드 데이터 생성 중... ({generationStatus.completedSessions || 0}/{generationStatus.totalSessions || 0} 세션 완료)
                                    </span>
                                    <div className="flex-1 bg-emerald-200 rounded-full h-2">
                                        <div
                                            className="bg-emerald-600 h-2 rounded-full transition-all"
                                            style={{ width: `${generationStatus.totalSessions ? (generationStatus.completedSessions / generationStatus.totalSessions) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {sessionsLoading ? (
                                <div className="text-center py-12 px-6">
                                    <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-4 animate-spin" />
                                    <p className="text-muted-foreground">세션 목록을 불러오는 중...</p>
                                </div>
                            ) : sessions.length === 0 ? (
                                <div className="text-center py-12 px-6">
                                    <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                    <p className="text-muted-foreground">
                                        Excel 파일을 업로드하면 세션이 자동 생성됩니다
                                    </p>
                                </div>
                            ) : (
                                <ScrollSyncTable minWidth="1100px" maxHeight="500px">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-background z-10">
                                            <TableRow>
                                                <TableHead className="w-12">
                                                    <Checkbox
                                                        checked={selectedSessions.length === sessions.length && sessions.length > 0}
                                                        onCheckedChange={(checked) => {
                                                            setSelectedSessions(checked ? sessions.map(s => s.sessionId) : []);
                                                        }}
                                                        disabled={isViewer}
                                                    />
                                                </TableHead>
                                                <TableHead className="w-[200px]">세션명</TableHead>
                                                <TableHead className="w-[80px] text-center">행수</TableHead>
                                                <TableHead className="w-[180px]">대계정컬럼</TableHead>
                                                <TableHead className="w-[180px]">금액컬럼</TableHead>
                                                <TableHead className="w-[180px]">공급업체명</TableHead>
                                                <TableHead className="w-[180px]">코스트센터명</TableHead>
                                                <TableHead className="w-[80px] text-center">상태</TableHead>
                                                <TableHead className="w-[60px]">삭제</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sessions.map((session) => {
                                                const cols = getSessionColumns(session);
                                                const isSessionProcessing = cols.length === 0;

                                                return (
                                                    <TableRow key={session.sessionId} className={session.isCompleted ? 'bg-emerald-50' : ''}>
                                                        <TableCell>
                                                            <Checkbox
                                                                checked={selectedSessions.includes(session.sessionId)}
                                                                onCheckedChange={(checked) => {
                                                                    setSelectedSessions(prev =>
                                                                        checked
                                                                            ? [...prev, session.sessionId]
                                                                            : prev.filter(id => id !== session.sessionId)
                                                                    );
                                                                }}
                                                                disabled={isViewer}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="truncate font-medium" title={session.sessionName}>
                                                                {session.sessionName}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {isSessionProcessing ? (
                                                                <Loader2 className="h-4 w-4 animate-spin mx-auto text-amber-500" />
                                                            ) : (
                                                                (session.totalRowCount || session.totalRows ||
                                                                    (session.uploadedFiles?.reduce((sum, f) => sum + (f.rowCount || 0), 0)) || 0
                                                                ).toLocaleString()
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {renderColumnSelect(session, cols, 'accountColumn', '필수', isSessionProcessing)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {renderColumnSelect(session, cols, 'amountColumn', '필수', isSessionProcessing)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {renderColumnSelect(session, cols, 'supplierColumn', '선택', isSessionProcessing)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {renderColumnSelect(session, cols, 'costCenterColumn', '선택', isSessionProcessing)}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {isSessionProcessing ? (
                                                                <Badge variant="outline" className="border-amber-400 text-amber-600 text-xs">
                                                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                                    파싱중
                                                                </Badge>
                                                            ) : session.isCompleted ? (
                                                                <Badge className="bg-emerald-500 text-xs">완료</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-muted-foreground text-xs">대기</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleDeleteSingleSession(session.sessionId)}
                                                                disabled={isViewer || isGenerating}
                                                            >
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </ScrollSyncTable>
                            )}
                        </CardContent>
                    </Card>

                    {/* 하단 버튼 영역 */}
                    <div className="flex justify-end gap-3">
                        {isDashboardGenerated && !project?.isCompleted && (
                            <Button
                                onClick={() => setCompleteDialogOpen(true)}
                                disabled={isViewer}
                                className="bg-sky-500 hover:bg-sky-600"
                            >
                                프로젝트 완료
                            </Button>
                        )}
                        {canEnterDashboard && (
                            <Button
                                onClick={() => navigate(`/projects/${projectId}/longlist`)}
                                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                                size="lg"
                            >
                                <BarChart3 className="h-5 w-5" />
                                대시보드 진입
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* 업로드 진행 다이얼로그 */}
                <ProgressDialog
                    open={progressDialogOpen}
                    message={progressMessage}
                    value={progressValue}
                />

                {/* 프로젝트 완료 확인 다이얼로그 */}
                <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>프로젝트 완료</DialogTitle>
                            <DialogDescription>
                                프로젝트를 완료 처리하시겠습니까? 완료 후 대시보드에 진입할 수 있습니다.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>취소</Button>
                            <Button onClick={handleProjectComplete} className="bg-sky-500 hover:bg-sky-600">프로젝트 완료</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* 세션 삭제 확인 다이얼로그 */}
                <Dialog open={deleteConfirmDialog.open} onOpenChange={(open) => !open && setDeleteConfirmDialog({ open: false, sessionIds: [], hasDashboard: false })}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-red-500" />
                                세션 삭제 확인
                            </DialogTitle>
                            <DialogDescription className="pt-2">
                                {deleteConfirmDialog.hasDashboard
                                    ? '세션을 삭제하면 대시보드 데이터(Long/Short List, 과제, 대시보드)가 전부 초기화됩니다. 계속하시겠습니까?'
                                    : `선택한 ${deleteConfirmDialog.sessionIds.length}개 세션을 삭제하시겠습니까?`
                                }
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteConfirmDialog({ open: false, sessionIds: [], hasDashboard: false })}>취소</Button>
                            <Button variant="destructive" onClick={executeDeleteSessions}>삭제</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* 엑셀 데이터 재분석 확인 다이얼로그 */}
                <Dialog open={reanalyzeConfirmOpen} onOpenChange={setReanalyzeConfirmOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <RefreshCw className="h-5 w-5 text-blue-500" />
                                엑셀 데이터 재분석
                            </DialogTitle>
                            <DialogDescription className="pt-2">
                                선택한 <strong>{selectedSessions.length}개 세션</strong>의 엑셀 데이터를 재분석합니다.
                                <br /><br />
                                기존 raw_data와 session_data가 삭제되고 엑셀 파일에서 데이터를 다시 추출합니다.
                                행 수가 0건으로 표시되는 문제를 해결할 수 있습니다.
                                <br /><br />
                                <span className="text-amber-600 font-medium">재분석 중에는 해당 세션의 데이터를 사용할 수 없습니다.</span>
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setReanalyzeConfirmOpen(false)}>취소</Button>
                            <Button onClick={executeReanalyze} className="bg-blue-600 hover:bg-blue-700">재분석 시작</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* 메시지 다이얼로그 (성공/에러) */}
                <Dialog open={msgDialog.open} onOpenChange={(open) => setMsgDialog(prev => ({ ...prev, open }))}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                {msgDialog.type === 'error'
                                    ? <AlertCircle className="h-5 w-5 text-red-500" />
                                    : <CheckCircle2 className="h-5 w-5 text-green-500" />
                                }
                                {msgDialog.title}
                            </DialogTitle>
                            <DialogDescription className="pt-2 whitespace-pre-wrap">
                                {msgDialog.message}
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button onClick={() => setMsgDialog(prev => ({ ...prev, open: false }))}>
                                확인
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}

export default DashboardUploadPage;
