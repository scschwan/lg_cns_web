// frontend/src/pages/upload/MultiFileUploadPage.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Upload,
    Folder,
    FolderOpen,
    Trash2,
    GitMerge,
    Play,
    Plus,
    Download,
    Loader2,
    FileText,
    DollarSign,
    User,
    AlertCircle,
    CheckCircle2,
    RotateCcw,
    Lock,
    Clock,
    Eye,
    RefreshCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Input } from '@/components/ui/input';

import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import projectService from '../../services/projectService';
import uploadService from '../../services/uploadService';
import adminService from '../../services/adminService';
import costReductionService from '../../services/costReductionService';
import { useAuth } from '../../context/AuthContext';
import { useUploadPageLock } from '../../hooks/useUploadPageLock';
import PartitionDialog from '../../components/upload/PartitionDialog';
import ProgressDialog from '../../components/common/ProgressDialog';
import { Progress } from '@/components/ui/progress';

/**
 * 가로 스크롤 동기화 테이블 래퍼
 * - 테이블 본체: 세로 스크롤 + 가로 스크롤(스크롤바 숨김)
 * - 바깥 스크롤바: 테이블 아래 고정, 양방향 동기화
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

function MultiFileUploadPage() {
    const { projectId } = useParams();
    const navigate = useNavigate();

    // 편집자 잠금: 다른 편집자가 사용 중이면 진입 차단
    const { isEditor: isPageEditor, editorInfo, loading: lockLoading } = useUploadPageLock(projectId);
    const { user: currentUser } = useAuth();

    // 다른 사용자가 편집 중인 세션인지 판별
    const isSessionLockedByOther = (session) => {
        return session?.isEditing && session?.editorUserId && session.editorUserId !== currentUser?.userId;
    };

    // 상태 관리
    const [project, setProject] = useState(null);
    const [files, setFiles] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [selectedSessions, setSelectedSessions] = useState([]);

    // 다이얼로그 상태
    const [partitionDialogOpen, setPartitionDialogOpen] = useState(false);
    const [partitions, setPartitions] = useState([]);
    const [progressDialogOpen, setProgressDialogOpen] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    const [progressValue, setProgressValue] = useState(0);

    // 편집 상태
    const [editingSession, setEditingSession] = useState(null);

    const [isProcessing, setIsProcessing] = useState(false);

    // 파일 업로드 진행률 상태 (uploadId → progress%)
    const [uploadProgress, setUploadProgress] = useState({});
    const pollingRef = useRef(null);

    // 프로젝트 완료
    const [completeDialogOpen, setCompleteDialogOpen] = useState(false);

    // 세션 삭제 확인 다이얼로그
    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({ open: false, sessionIds: [], hasDashboard: false });

    // 엑셀 데이터 재분석 상태
    const [isReanalyzing, setIsReanalyzing] = useState(false);
    const [reanalyzeConfirmOpen, setReanalyzeConfirmOpen] = useState(false);

    // 메시지 다이얼로그 상태
    const [msgDialog, setMsgDialog] = useState({ open: false, type: 'error', title: '', message: '' });
    const showMessage = (type, title, message) => setMsgDialog({ open: true, type, title, message });
    const showError = (title, message) => showMessage('error', title, message);
    const showSuccess = (title, message) => showMessage('success', title, message);
    // 백엔드 에러 응답에서 메시지 추출
    const getErrorMsg = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

    // 뷰어 권한 제한
    const myRole = project?.myRole || 'VIEWER';
    const isViewer = myRole === 'VIEWER';

    useEffect(() => {
        loadProject();
        loadFiles();
        loadSessions();
    }, [projectId]);

    const loadProject = async () => {
        try {
            const data = await projectService.getProject(projectId);
            setProject(data);
        } catch (error) {
            console.error('프로젝트 로드 실패:', error);
        }
    };

    const loadFiles = async () => {
        try {
            const fileList = await uploadService.getProjectFiles(projectId);
            const arr = Array.isArray(fileList) ? fileList : [];
            const initializedFiles = arr.map(f => ({
                ...f,
                checked: false
            }));
            setFiles(initializedFiles);
        } catch (error) {
            console.error("파일 로드 실패", error);
            setFiles([]);
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

    /**
     * s3Key에서 uploadId 추출
     * 형식: projects/{projectId}/sessions/{sessionId}/uploads/{uploadId}/{fileName}
     */
    const extractUploadId = (s3Key) => {
        if (!s3Key) return null;
        const parts = s3Key.split('/');
        const uploadsIndex = parts.indexOf('uploads');
        if (uploadsIndex >= 0 && uploadsIndex + 1 < parts.length) {
            return parts[uploadsIndex + 1];
        }
        return null;
    };

    /**
     * 업로드 중인 파일들의 진행률 폴링
     * - PROCESSING 상태이거나 detectedColumns/rowCount가 없는 파일 대상
     * - 2초 간격으로 폴링하여 파싱 진행률 업데이트
     */
    useEffect(() => {
        const processingFiles = files.filter(
            f => f.uploadStatus === 'PROCESSING' ||
                 ((!f.detectedColumns || f.detectedColumns.length === 0) && (!f.rowCount || f.rowCount === 0))
        );

        if (processingFiles.length === 0) {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            return;
        }

        // 2초 간격으로 진행률 폴링 (기존 5초에서 단축)
        pollingRef.current = setInterval(async () => {
            let hasChanges = false;
            const newProgress = { ...uploadProgress };

            for (const file of processingFiles) {
                const uploadId = extractUploadId(file.s3Key);
                if (!uploadId) continue;

                try {
                    const status = await uploadService.getUploadStatus(projectId, uploadId);
                    // 백엔드 응답: { status, progress(0-100), processedRows, totalRows, fileName, error }
                    const processedRows = status.processedRows || 0;
                    const totalRows = status.totalRows || 0;
                    const rowInfo = totalRows > 0
                        ? `${processedRows.toLocaleString()} / ${totalRows.toLocaleString()}행`
                        : processedRows > 0 ? `${processedRows.toLocaleString()}행 처리 중` : '';
                    newProgress[uploadId] = {
                        percent: status.progress || 0,
                        status: status.status || 'PROCESSING',
                        rowInfo,
                        error: status.error || '',
                    };

                    if (status.status === 'COMPLETED' || status.status === 'FAILED') {
                        hasChanges = true;
                    }
                } catch (e) {
                    // 상태 조회 실패 시 무시
                }
            }

            setUploadProgress(newProgress);

            // 완료된 파일이 있으면 파일 목록 새로고침
            if (hasChanges) {
                loadFiles();
                loadSessions();
            }
        }, 2000);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [files.map(f => f.fileId + (f.uploadStatus || '') + (f.detectedColumns?.length || 0)).join(',')]);

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
           const uploadResults = [];
           const totalFiles = excelFiles.length;

           for (let i = 0; i < totalFiles; i++) {
               const file = excelFiles[i];
               // 파일당 진행률 구간: 0~90% (각 파일 = 90/totalFiles%)
               const fileBaseProgress = (i / totalFiles) * 90;
               const fileEndProgress = ((i + 1) / totalFiles) * 90;

               setProgressValue(Math.round(fileBaseProgress + 5));
               setProgressMessage(`[${i + 1}/${totalFiles}] ${file.name} - Presigned URL 요청 중...`);

               const { presignedUrl, uploadId, sessionId, s3Key } =
                   await uploadService.getPresignedUrl(projectId, file.name, file.size);

               setProgressMessage(`[${i + 1}/${totalFiles}] ${file.name} - S3 업로드 중...`);

               await uploadService.uploadToS3(presignedUrl, file, (s3Pct) => {
                   // S3 업로드 진행률을 파일 구간 내 50%까지 매핑
                   const mapped = fileBaseProgress + (s3Pct / 100) * (fileEndProgress - fileBaseProgress) * 0.5;
                   setProgressValue(Math.round(mapped));
               });

               setProgressMessage(`[${i + 1}/${totalFiles}] ${file.name} - 서버 등록 중...`);
               setProgressValue(Math.round(fileBaseProgress + (fileEndProgress - fileBaseProgress) * 0.7));

               const result = await uploadService.completeFileUpload(projectId, {
                   uploadId,
                   sessionId,
                   fileName: file.name,
                   fileSize: file.size,
                   s3Key,
               });

               uploadResults.push(result);
               setProgressValue(Math.round(fileEndProgress));
           }

           setProgressValue(95);
           setProgressMessage('파일 목록 갱신 중...');
           await loadFiles();
           await loadSessions();

           setProgressValue(100);
           setProgressMessage('업로드 완료!');
           setTimeout(() => {
               setProgressDialogOpen(false);
               showSuccess('업로드 완료', `${totalFiles}개의 파일이 업로드되었습니다.\n백그라운드에서 파싱이 진행됩니다.`);
           }, 400);

       } catch (error) {
           console.error('파일 업로드 실패:', error);
           showError('업로드 실패', getErrorMsg(error, '파일 업로드 중 오류가 발생했습니다.'));
           setProgressDialogOpen(false);
       }
   };



    const analyzeExcelColumns = async (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                    const columns = jsonData[0] || [];
                    const rowCount = jsonData.length - 1;

                    resolve({
                        columns: columns.filter((c) => c),
                        rowCount,
                    });
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    const handleColumnSelect = async (fileId, columnType, columnName) => {
        if (isProcessing) return;

        try {
            setIsProcessing(true);

            const params = {};
            if (columnType === 'accountColumnName') {
                params.accountColumnName = columnName;
            } else if (columnType === 'amountColumnName') {
                params.amountColumnName = columnName;
            }

            const updatedFileInfo = await uploadService.updateFileColumns(
                projectId,
                fileId,
                params
            );

            setFiles((prev) =>
                prev.map((f) =>
                    f.fileId === fileId
                        ? {
                              ...f,
                              accountColumnName:
                                  updatedFileInfo.accountColumnName || f.accountColumnName,
                              amountColumnName:
                                  updatedFileInfo.amountColumnName || f.amountColumnName,
                              accountContents:
                                  updatedFileInfo.accountContents || f.accountContents || [],
                              totalAmount:
                                  updatedFileInfo.totalAmount !== undefined
                                      ? updatedFileInfo.totalAmount
                                      : f.totalAmount,
                          }
                        : f
                )
            );
        } catch (err) {
            console.error('컬럼 선택 실패:', err);
            showError('컬럼 설정 실패', getErrorMsg(error, '컬럼 선택에 실패했습니다.'));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleToggleCheck = (fileId) => {
        setFiles((prevFiles) =>
            prevFiles.map((file) =>
                file.fileId === fileId
                    ? { ...file, checked: !file.checked }
                    : file
            )
        );
    };

    const handleToggleAll = (checked) => {
        setFiles((prevFiles) =>
            prevFiles.map((file) => ({
                ...file,
                checked: checked
            }))
        );
    };

    const handleCreateSessions = async () => {
        const selectedFiles = files.filter(f => f.checked);
        if (selectedFiles.length === 0) {
            showError('파일 선택 필요', '세션을 생성할 파일을 선택해주세요.');
            return;
        }

        // ★ 계정명 컬럼 / 금액 컬럼 미선택 검증
        const missingAccount = selectedFiles.filter(f => !f.accountColumnName);
        const missingAmount  = selectedFiles.filter(f => !f.amountColumnName);
        if (missingAccount.length > 0 || missingAmount.length > 0) {
            const msgs = [];
            if (missingAccount.length > 0) {
                const names = missingAccount.map(f => f.originalFileName || f.fileName).join(', ');
                msgs.push(`[계정명 컬럼] 미선택 파일: ${names}`);
            }
            if (missingAmount.length > 0) {
                const names = missingAmount.map(f => f.originalFileName || f.fileName).join(', ');
                msgs.push(`[금액 컬럼] 미선택 파일: ${names}`);
            }
            showError('컬럼 선택 필요', `선택한 파일의 필수 컬럼 값을 지정해주세요.\n\n${msgs.join('\n')}`);
            return;
        }

        try {
            setIsProcessing(true);

            const fileIds = selectedFiles.map(f => f.fileId);
            const response = await uploadService.analyzePartitions(projectId, fileIds);

            const mappedPartitions = (Array.isArray(response?.partitions) ? response.partitions : []).map((p) => ({
                ...p,
                totalRows: p.rowCount,
                totalAmount: p.totalAmount,
                fileCount: p.fileIds ? p.fileIds.length : (p.fileId ? 1 : 0),
                fileIds: p.fileIds || [p.fileId],
                fileId: p.fileId,
                sessionName: p.sessionName || `${p.accountName}_session`,
                workerName: ''
            }));

            setPartitions(mappedPartitions);
            setPartitionDialogOpen(true);

        } catch (error) {
            console.error("세션 분석 실패:", error);
            showError('분석 실패', getErrorMsg(error, '파일 분석 중 오류가 발생했습니다.'));
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePartitionsApproved = async (approvedItems) => {
        setPartitionDialogOpen(false);
        setProgressDialogOpen(true);
        setProgressValue(10);
        setProgressMessage(`${approvedItems.length}개 세션 생성 준비 중...`);

        try {
            setProgressValue(30);
            setProgressMessage('서버에 세션 생성 요청 중...');

            const createdSessions = await uploadService.createSessions(
                projectId,
                approvedItems
            );

            setProgressValue(90);
            setProgressMessage('세션 목록 갱신 중...');

            if (!createdSessions || createdSessions.length === 0) {
                setProgressDialogOpen(false);
                showError('세션 생성 실패', '생성된 세션이 없습니다.');
            } else {
                setSessions((prev) => [...prev, ...createdSessions]);
                setSelectedFiles([]);
                setProgressValue(100);
                setProgressMessage('완료!');
                setTimeout(() => {
                    setProgressDialogOpen(false);
                    showSuccess('세션 생성 완료', `${createdSessions.length}개의 세션이 생성되었습니다.`);
                }, 400);
            }
        } catch (error) {
            console.error('세션 생성 실패:', error);
            setProgressDialogOpen(false);
            showError('세션 생성 실패', getErrorMsg(error, '세션 생성 중 오류가 발생했습니다.'));
        }
    };

    const handleMergeSessions = async () => {
        if (selectedSessions.length < 2) {
            showError('병합 불가', '병합할 세션을 2개 이상 선택해주세요.');
            return;
        }

        const confirmed = window.confirm(
            `선택된 ${selectedSessions.length}개의 세션을 병합하시겠습니까?\n\n` +
                `※ 첫 번째 세션을 제외한 나머지 세션들은 삭제됩니다.`
        );

        if (!confirmed) return;

        setProgressDialogOpen(true);
        setProgressMessage('세션 병합 중...');

        try {
            // 선택된 세션 중 첫 번째 세션의 이름으로 자동 생성
            const firstSession = sessions.find(s => s.sessionId === selectedSessions[0]);
            const firstSessionName = firstSession?.sessionName || '세션';
            const autoSessionName = selectedSessions.length > 1
                ? `${firstSessionName} 외 ${selectedSessions.length - 1}개`
                : firstSessionName;

            await uploadService.mergeSessions(projectId, selectedSessions, autoSessionName);
            loadSessions();
            setSelectedSessions([]);
            setProgressDialogOpen(false);
            showSuccess('병합 완료', '세션 병합이 완료되었습니다.');
        } catch (error) {
            console.error('세션 병합 실패:', error);
            showError('병합 실패', getErrorMsg(error, '세션 병합 중 오류가 발생했습니다.'));
            setProgressDialogOpen(false);
        }
    };

    const handleDeleteSessions = async () => {
        if (selectedSessions.length === 0) {
            showError('선택 필요', '삭제할 세션을 선택해주세요.');
            return;
        }
        let hasDashboard = false;
        try {
            const status = await costReductionService.getDashboardGenerationStatus(projectId);
            hasDashboard = status?.status === 'COMPLETED' || status?.status === 'COMPLETED_WITH_ERRORS';
        } catch { /* 대시보드 데이터 없음 */ }
        setDeleteConfirmDialog({ open: true, sessionIds: [...selectedSessions], hasDashboard });
    };

    const executeDeleteSessions = async () => {
        const { sessionIds } = deleteConfirmDialog;
        setDeleteConfirmDialog({ open: false, sessionIds: [] });

        try {
            await uploadService.deleteSessions(projectId, sessionIds);
            loadSessions();
            setSelectedSessions(prev => prev.filter(id => !sessionIds.includes(id)));
            showSuccess('삭제 완료', '세션이 삭제되었습니다.');
        } catch (error) {
            console.error('세션 삭제 실패:', error);
            showError('삭제 실패', getErrorMsg(error, '세션 삭제 중 오류가 발생했습니다.'));
        }
    };

   // step → URL 경로 매핑
   const stepToPath = (step) => {
       const map = {
           START_ANALYSIS: 'startanalysis',
           PREPROCESSING: 'preprocessing',
           TRANSFORM: 'transform',
           CLUSTERING: 'clustering',
           EXPORT: 'export',
           DETAIL_CLUSTERING: 'detailclustering',
       };
       return map[step] || 'startanalysis';
   };

   // 세션의 마지막 step 경로 결정 (Detail Clustering 제외)
   const getLastStepPath = (session) => {
       if (session?.stepHistory?.length > 0) {
           for (let i = session.stepHistory.length - 1; i >= 0; i--) {
               const step = session.stepHistory[i];
               if (step.step !== 'DETAIL_CLUSTERING') {
                   return stepToPath(step.step);
               }
           }
       }
       if (session?.currentStep && session.currentStep !== 'DETAIL_CLUSTERING') {
           return stepToPath(session.currentStep);
       }
       return 'startanalysis';
   };

   const handleStartAnalysis = async () => {
       if (selectedSessions.length !== 1) return;

       const sessionId = selectedSessions[0];

       // 세션 편집자 잠금 확인: 다른 사용자가 편집 중이면 뷰어 모드로 진입
       const targetSession = sessions.find(s => s.sessionId === sessionId);
       if (targetSession?.isEditing && targetSession?.editorUserId) {
           try {
               const lockStatus = await uploadService.getSessionLockStatus(projectId, sessionId);
               if (lockStatus.isLocked && !lockStatus.isEditor) {
                   // 세션 상세 조회 → 현재 진행 단계로 뷰어 모드 진입
                   const sessionDetail = await uploadService.getSession(projectId, sessionId);
                   const lastPath = getLastStepPath(sessionDetail);
                   navigate(`/projects/${projectId}/sessions/${sessionId}/${lastPath}`);
                   return;
               }
           } catch (e) {
               console.warn('잠금 상태 확인 실패, 계속 진행:', e);
           }
       }

       try {
           setProgressDialogOpen(true);
           setProgressValue(0);
           setProgressMessage('계정 분석을 시작합니다...');

           const result = await uploadService.startAccountAnalysis(projectId, sessionId);

           // 이미 완료된 경우 (기존 데이터 존재) → 마지막 step으로 이동
           if (result.status === 'COMPLETED' || result.skipped) {
               setProgressValue(100);
               setProgressMessage('완료');
               setProgressDialogOpen(false);

               // 세션 상세 조회하여 마지막 step 확인
               const sessionDetail = await uploadService.getSession(projectId, sessionId);
               const lastPath = getLastStepPath(sessionDetail);
               showSuccess('기존 분석 데이터', `기존 분석 데이터(${result.copiedCount}건)가 있습니다. 마지막 작업 단계로 이동합니다.`);
               navigate(`/projects/${projectId}/sessions/${sessionId}/${lastPath}`);
               return;
           }

           // 비동기 처리 중 → 폴링으로 상태 추적
           setProgressMessage('데이터 복사 중...');
           setProgressValue(10);

           let attempts = 0;
           const maxAttempts = 300; // 최대 5분 (1초 간격)

           while (attempts < maxAttempts) {
               await new Promise(resolve => setTimeout(resolve, 1000));
               attempts++;

               try {
                   const status = await uploadService.getAnalysisStatus(projectId, sessionId);

                   if (status.status === 'COMPLETED') {
                       setProgressValue(100);
                       setProgressMessage(`${status.copiedCount}건 복사 완료`);
                       await new Promise(resolve => setTimeout(resolve, 500));
                       setProgressDialogOpen(false);
                       navigate(`/projects/${projectId}/sessions/${sessionId}/startanalysis`);
                       return;
                   }

                   if (status.status === 'FAILED') {
                       setProgressDialogOpen(false);
                       showError('분석 실패', status.error || '알 수 없는 오류');
                       return;
                   }

                   // 진행률 표시 (10% ~ 95%)
                   const progress = Math.min(10 + (attempts / maxAttempts) * 85, 95);
                   setProgressValue(Math.round(progress));
                   setProgressMessage(
                       `데이터 복사 중... ${status.copiedCount || 0}건 처리됨`
                   );
               } catch (pollError) {
                   console.warn('상태 조회 실패, 재시도...', pollError);
               }
           }

           // 타임아웃
           setProgressDialogOpen(false);
           showError('시간 초과', '분석 처리 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');

       } catch (error) {
           console.error('계정 분석 시작 실패:', error);
           setProgressDialogOpen(false);
           showError('분석 시작 실패', getErrorMsg(error, '계정 분석 시작 중 오류가 발생했습니다.'));
       }
   };



    const handleSessionEdit = async (sessionId, field, value) => {
        try {
            await uploadService.updateSession(projectId, sessionId, {
                [field]: value,
            });

            setSessions((prev) =>
                prev.map((s) =>
                    s.sessionId === sessionId ? { ...s, [field]: value } : s
                )
            );
        } catch (error) {
            console.error('세션 수정 실패:', error);
        }
    };

    const handleDeleteFile = async (fileId) => {
        const confirmed = window.confirm('파일을 삭제하시겠습니까?');
        if (!confirmed) return;

        setFiles((prev) => prev.filter((f) => f.fileId !== fileId));

        try {
            await uploadService.deleteFile(projectId, fileId);

        } catch (error) {
            console.error('파일 삭제 실패:', error);
            showError('삭제 실패', getErrorMsg(error, '파일 삭제 중 오류가 발생했습니다.'));
        }
    };

    const handleDownload = async (sessionId) => {
        try {
            const url = await uploadService.downloadResult(projectId, sessionId);
            window.open(url, '_blank');
        } catch (error) {
            console.error('다운로드 실패:', error);
            showError('다운로드 실패', getErrorMsg(error, '다운로드 중 오류가 발생했습니다.'));
        }
    };

    const handleDeleteSingleSession = async (sessionId) => {
        let hasDashboard = false;
        try {
            const status = await costReductionService.getDashboardGenerationStatus(projectId);
            hasDashboard = status?.status === 'COMPLETED' || status?.status === 'COMPLETED_WITH_ERRORS';
        } catch { /* 대시보드 데이터 없음 */ }
        setDeleteConfirmDialog({ open: true, sessionIds: [sessionId], hasDashboard });
    };

    const handleBulkDeleteFiles = async () => {
        const checkedFiles = files.filter(f => f.checked);
        if (checkedFiles.length === 0) {
            showError('선택 필요', '삭제할 파일을 선택해주세요.');
            return;
        }

        const confirmed = window.confirm(`선택된 ${checkedFiles.length}개의 파일을 삭제하시겠습니까?`);
        if (!confirmed) return;

        try {
            for (const file of checkedFiles) {
                await uploadService.deleteFile(projectId, file.fileId);
            }
            loadFiles();
            showSuccess('삭제 완료', `${checkedFiles.length}개의 파일이 삭제되었습니다.`);
        } catch (error) {
            console.error('파일 삭제 실패:', error);
            showError('삭제 실패', getErrorMsg(error, '파일 삭제 중 오류가 발생했습니다.'));
        }
    };

    // 세션 초기화
    const [resetDialogOpen, setResetDialogOpen] = useState(false);
    const [resetTargetSession, setResetTargetSession] = useState(null);

    const handleResetSession = async () => {
        if (!resetTargetSession) return;
        try {
            await adminService.resetSession(resetTargetSession.sessionId);
            setResetDialogOpen(false);
            setResetTargetSession(null);
            loadSessions();
            showSuccess('초기화 완료', '세션이 초기화되었습니다.');
        } catch (error) {
            console.error('세션 초기화 실패:', error);
            showError('초기화 실패', getErrorMsg(error, '세션 초기화에 실패했습니다.'));
        }
    };

    const handleProjectComplete = async () => {
        try {
            await projectService.completeProject(projectId);
            setCompleteDialogOpen(false);
            loadProject();
            loadSessions();
            adminService.logUserActivity('BUTTON_CLICK', 'PROJECT', projectId, '프로젝트 완료 처리');
            showSuccess('프로젝트 완료', '프로젝트가 완료 처리되었습니다.');
        } catch (error) {
            console.error('프로젝트 완료 실패:', error);
            showError('완료 처리 실패', getErrorMsg(error, '프로젝트 완료 처리에 실패했습니다.'));
        }
    };

    // ===== 엑셀 데이터 재분석 =====
    const handleReanalyzeExcelData = () => {
        const checkedFiles = files.filter(f => f.checked);
        if (checkedFiles.length === 0) {
            showError('선택 필요', '재분석할 파일을 선택해주세요.');
            return;
        }
        setReanalyzeConfirmOpen(true);
    };

    const executeReanalyze = async () => {
        setReanalyzeConfirmOpen(false);
        const checkedFiles = files.filter(f => f.checked);
        const fileIds = checkedFiles.map(f => f.fileId);

        setIsReanalyzing(true);
        setProgressDialogOpen(true);
        setProgressValue(10);
        setProgressMessage('엑셀 데이터 재분석 요청 중...');

        try {
            const result = await uploadService.reanalyzeExcelData(projectId, { fileIds });

            setProgressValue(30);
            setProgressMessage(`${result.totalFilesProcessed}개 파일 재분석 시작됨. Lambda 처리 대기 중...`);

            // 파일 목록 갱신 (PROCESSING 상태로 변경되어 폴링에 잡히도록)
            await loadFiles();
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

    // 잠금 로딩 중 표시
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
                            <BreadcrumbPage>다중 파일 업로드</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>

                {/* Header Card */}
                <Card className="mb-6">
                    <CardHeader>
                        <div className="flex items-start justify-between">
                            <div>
                                <CardTitle className="text-2xl">다중 파일 업로드</CardTitle>
                                <p className="text-sm text-muted-foreground mt-2">
                                    여러 Excel 파일을 업로드하고 계정명/금액 컬럼을 선택한 후, 동일한 컬럼명끼리 세션을 생성하세요.
                                </p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-3">
                            <div className="flex gap-2">
                                <Button asChild disabled={isViewer}>
                                    <label className={`cursor-pointer ${isViewer ? 'pointer-events-none opacity-50' : ''}`}>
                                        <Upload className="h-4 w-4 mr-2" />
                                        Excel 파일 업로드
                                        <input
                                            type="file"
                                            hidden
                                            multiple
                                            accept=".xlsx,.xls"
                                            onChange={handleFileUpload}
                                            disabled={isViewer}
                                        />
                                    </label>
                                </Button>
                                <Button onClick={handleCreateSessions} variant="default" disabled={isViewer}>
                                    <FolderOpen className="h-4 w-4 mr-2" />
                                    세션 생성
                                </Button>
                                <Button
                                    onClick={handleReanalyzeExcelData}
                                    variant="outline"
                                    disabled={isViewer || isReanalyzing || !files.some(f => f.checked)}
                                >
                                    {isReanalyzing ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                    )}
                                    엑셀 데이터 재분석
                                </Button>
                            </div>
                            {isViewer && (
                                <span className="text-xs text-muted-foreground self-center ml-2">뷰어 권한: 조회만 가능</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    {/* 상단: 파일 목록 (최대 화면 절반 높이) */}
                    <div>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">업로드된 파일 목록</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0" style={{ maxHeight: '30vh', overflow: 'auto' }}>
                                {files.length === 0 ? (
                                    <div className="text-center py-12 px-6">
                                        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <p className="text-muted-foreground">
                                            업로드된 파일이 없습니다
                                        </p>
                                    </div>
                                ) : (
                                    <ScrollSyncTable minWidth="1200px" maxHeight="none">
                                        <Table>
                                            <TableHeader className="sticky top-0 bg-background z-10">
                                                <TableRow>
                                                    <TableHead className="w-12">
                                                        <Checkbox
                                                            checked={files.length > 0 && files.every((f) => f.checked)}
                                                            onCheckedChange={(checked) => handleToggleAll(checked)}
                                                            disabled={isViewer}
                                                        />
                                                    </TableHead>
                                                    <TableHead className="w-[300px]">파일명</TableHead>
                                                    <TableHead className="w-[100px] text-center">행 수</TableHead>
                                                    <TableHead className="w-[180px]">
                                                        <div className="flex items-center gap-1">
                                                            <User className="h-3 w-3" />
                                                            대계정
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="w-[180px]">
                                                        <div className="flex items-center gap-1">
                                                            <DollarSign className="h-3 w-3" />
                                                            금액
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="w-[160px]">계정명</TableHead>
                                                    <TableHead className="w-[150px]">합산금액</TableHead>
                                                    <TableHead className="w-[80px]">
                                                        <div className="flex items-center gap-1">
                                                            삭제
                                                            {files.some(f => f.checked) && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={handleBulkDeleteFiles}
                                                                    disabled={isViewer}
                                                                    title="선택 파일 삭제"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {(Array.isArray(files) ? files : []).map((file) => (
                                                    <TableRow key={file.fileId}>
                                                        <TableCell>
                                                            <Checkbox
                                                                checked={file.checked || false}
                                                                onCheckedChange={() => handleToggleCheck(file.fileId)}
                                                                disabled={isViewer}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="font-medium truncate">
                                                            {file.fileName}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {(file.uploadStatus === 'PROCESSING' || (!file.detectedColumns?.length && !file.rowCount)) ? (
                                                                <Clock className="h-4 w-4 text-amber-400 mx-auto" />
                                                            ) : (
                                                                file.rowCount?.toLocaleString() || '0'
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {(file.uploadStatus === 'PROCESSING' || (!file.detectedColumns?.length && !file.rowCount)) ? (
                                                                (() => {
                                                                    const uid = extractUploadId(file.s3Key);
                                                                    const progressData = uid && uploadProgress[uid];
                                                                    const percent = progressData?.percent || 0;
                                                                    const isFailed = progressData?.status === 'FAILED';
                                                                    const rowInfo = progressData?.rowInfo || '';
                                                                    return (
                                                                        <div className="space-y-1 min-w-[130px]">
                                                                            <div className="flex items-center gap-1.5">
                                                                                {isFailed ? (
                                                                                    <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                                                                                ) : (
                                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500 flex-shrink-0" />
                                                                                )}
                                                                                <span className={`text-xs font-medium ${isFailed ? 'text-red-600' : 'text-amber-600'}`}>
                                                                                    {isFailed ? '파싱 실패' : '파싱 중...'}
                                                                                </span>
                                                                                {!isFailed && percent > 0 && (
                                                                                    <span className="text-xs text-amber-500 ml-auto">{percent}%</span>
                                                                                )}
                                                                            </div>
                                                                            {!isFailed && (
                                                                                <Progress
                                                                                    value={percent}
                                                                                    className="h-1.5 bg-amber-100 [&>div]:bg-amber-500"
                                                                                />
                                                                            )}
                                                                            {!isFailed && rowInfo && (
                                                                                <span className="text-[10px] text-amber-400 leading-none">{rowInfo}</span>
                                                                            )}
                                                                            {isFailed && progressData?.error && (
                                                                                <span className="text-[10px] text-red-400 leading-none truncate block max-w-[130px]" title={progressData.error}>
                                                                                    {progressData.error}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()
                                                            ) : (
                                                                <Select
                                                                    value={file.accountColumnName || ''}
                                                                    onValueChange={(value) =>
                                                                        handleColumnSelect(file.fileId, 'accountColumnName', value)
                                                                    }
                                                                    disabled={isViewer}
                                                                >
                                                                    <SelectTrigger className="h-8">
                                                                        <SelectValue placeholder="선택..." />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {file.detectedColumns?.map((col) => (
                                                                            <SelectItem key={col} value={col}>{col}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {(file.uploadStatus === 'PROCESSING' || (!file.detectedColumns?.length && !file.rowCount)) ? (
                                                                (() => {
                                                                    const uid = extractUploadId(file.s3Key);
                                                                    const progressData = uid && uploadProgress[uid];
                                                                    const isFailed = progressData?.status === 'FAILED';
                                                                    return (
                                                                        <span className={`text-xs ${isFailed ? 'text-red-500' : 'text-amber-500'}`}>
                                                                            {isFailed ? '-' : '대기 중'}
                                                                        </span>
                                                                    );
                                                                })()
                                                            ) : (
                                                                <Select
                                                                    value={file.amountColumnName || ''}
                                                                    onValueChange={(value) =>
                                                                        handleColumnSelect(file.fileId, 'amountColumnName', value)
                                                                    }
                                                                    disabled={isViewer}
                                                                >
                                                                    <SelectTrigger className="h-8">
                                                                        <SelectValue placeholder="선택..." />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {file.detectedColumns?.map((col) => (
                                                                            <SelectItem key={col} value={col}>{col}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {file.accountContents?.length > 0 ? (
                                                                <div className="flex items-center gap-1">
                                                                    <Badge variant="secondary" className="font-normal whitespace-nowrap">
                                                                        {file.accountContents[0]}
                                                                    </Badge>
                                                                    {file.accountContents.length > 1 && (
                                                                        <span
                                                                            className="text-xs text-muted-foreground whitespace-nowrap cursor-help"
                                                                            title={file.accountContents.join(', ')}
                                                                        >
                                                                            외 {file.accountContents.length - 1}개
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                '-'
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {file.totalAmount
                                                                ? `${file.totalAmount.toLocaleString()} 원`
                                                                : '-'}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleDeleteFile(file.fileId)}
                                                                disabled={isViewer}
                                                            >
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </ScrollSyncTable>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* 하단: 세션 목록 */}
                    <div>
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">생성된 세션 목록</CardTitle>
                                    <div className="flex gap-2">
                                                <Button
                                                    onClick={handleMergeSessions}
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={selectedSessions.length < 2 || isViewer}
                                                >
                                                    <GitMerge className="h-4 w-4 mr-1" />
                                                    세션 병합
                                                </Button>
                                                <Button
                                                    onClick={handleDeleteSessions}
                                                    variant="destructive"
                                                    size="sm"
                                                    disabled={selectedSessions.length === 0 || isViewer}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-1" />
                                                    세션 삭제
                                                </Button>
                                                {(() => {
                                                    const sel = selectedSessions.length === 1
                                                        ? sessions.find(s => s.sessionId === selectedSessions[0])
                                                        : null;
                                                    const isLockedByOther = sel?.isEditing && sel?.editorUserId;
                                                    return (
                                                        <Button
                                                            onClick={handleStartAnalysis}
                                                            size="sm"
                                                            disabled={selectedSessions.length !== 1 || isViewer}
                                                            className={isLockedByOther
                                                                ? "bg-blue-600 hover:bg-blue-700"
                                                                : "bg-green-600 hover:bg-green-700"}
                                                        >
                                                            {isLockedByOther ? (
                                                                <>
                                                                    <Eye className="h-4 w-4 mr-1" />
                                                                    진행상황 보기
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Play className="h-4 w-4 mr-1" />
                                                                    계정 분석 시작
                                                                </>
                                                            )}
                                                        </Button>
                                                    );
                                                })()}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {sessionsLoading ? (
                                    <div className="text-center py-12 px-6">
                                        <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-4 animate-spin" />
                                        <p className="text-muted-foreground">
                                            세션 목록을 불러오는 중...
                                        </p>
                                    </div>
                                ) : sessions.length === 0 ? (
                                    <div className="text-center py-12 px-6">
                                        <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <p className="text-muted-foreground">
                                            생성된 세션이 없습니다
                                        </p>
                                    </div>
                                ) : (
                                    <ScrollSyncTable minWidth="1200px" maxHeight="500px">
                                        <Table>
                                            <TableHeader className="sticky top-0 bg-background z-10">
                                                <TableRow>
                                                    <TableHead className="w-12">
                                                        {(() => {
                                                            const selectableSessions = sessions.filter(s => !isSessionLockedByOther(s));
                                                            return (
                                                                <Checkbox
                                                                    checked={
                                                                        selectableSessions.length > 0 &&
                                                                        selectableSessions.every(s => selectedSessions.includes(s.sessionId))
                                                                    }
                                                                    onCheckedChange={(checked) => {
                                                                        if (checked) {
                                                                            setSelectedSessions(selectableSessions.map((s) => s.sessionId));
                                                                        } else {
                                                                            setSelectedSessions([]);
                                                                        }
                                                                    }}
                                                                    disabled={isViewer || selectableSessions.length === 0}
                                                                />
                                                            );
                                                        })()}
                                                    </TableHead>
                                                    <TableHead className="w-[180px]">세션명</TableHead>
                                                    <TableHead className="w-[80px] text-center">편집상태</TableHead>
                                                    <TableHead className="w-[100px]">작업자</TableHead>
                                                    <TableHead className="w-[120px]">대계정</TableHead>
                                                    <TableHead className="w-[100px] text-center">행수</TableHead>
                                                    <TableHead className="w-[130px]">합산금액</TableHead>
                                                    <TableHead className="w-[80px] text-center">진행상태</TableHead>
                                                    <TableHead className="w-[80px]">다운로드</TableHead>
                                                    <TableHead className="w-[60px]">초기화</TableHead>
                                                    <TableHead className="w-[60px]">삭제</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {(Array.isArray(sessions) ? sessions : []).map((session) => (
                                                    <TableRow
                                                        key={session.sessionId}
                                                        className={
                                                            isSessionLockedByOther(session)
                                                                ? 'bg-gray-100 opacity-60'
                                                                : session.analysisStatus === '완료'
                                                                    ? 'bg-sky-50'
                                                                    : session.analysisStatus === '진행중'
                                                                        ? 'bg-yellow-50'
                                                                        : ''
                                                        }
                                                    >
                                                        <TableCell>
                                                            <Checkbox
                                                                checked={selectedSessions.includes(session.sessionId)}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) {
                                                                        setSelectedSessions((prev) => [...prev, session.sessionId]);
                                                                    } else {
                                                                        setSelectedSessions((prev) =>
                                                                            prev.filter((id) => id !== session.sessionId)
                                                                        );
                                                                    }
                                                                }}
                                                                disabled={isViewer || isSessionLockedByOther(session)}
                                                                title={isSessionLockedByOther(session) ? `${session.editorUserName || '다른 사용자'}님이 작업 중입니다` : ''}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            {editingSession === session.sessionId ? (
                                                                <Input
                                                                    value={session.sessionName}
                                                                    onChange={(e) =>
                                                                        setSessions((prev) =>
                                                                            prev.map((s) =>
                                                                                s.sessionId === session.sessionId
                                                                                    ? { ...s, sessionName: e.target.value }
                                                                                    : s
                                                                            )
                                                                        )
                                                                    }
                                                                    onBlur={() => {
                                                                        handleSessionEdit(session.sessionId, 'sessionName', session.sessionName);
                                                                        setEditingSession(null);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            handleSessionEdit(session.sessionId, 'sessionName', session.sessionName);
                                                                            setEditingSession(null);
                                                                        }
                                                                    }}
                                                                    className="h-8"
                                                                    autoFocus
                                                                    disabled={isViewer}
                                                                />
                                                            ) : (
                                                                <div
                                                                    className={`truncate ${isViewer ? '' : 'cursor-pointer hover:text-primary'}`}
                                                                    onClick={() => !isViewer && setEditingSession(session.sessionId)}
                                                                    title={isViewer ? '' : '클릭하여 편집'}
                                                                >
                                                                    {session.sessionName}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {session.isEditing ? (
                                                                <Badge variant="destructive" className="text-xs gap-1">
                                                                    <Lock className="h-3 w-3" />
                                                                    {session.editorUserName || '편집중'}
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input
                                                                value={session.workerName || ''}
                                                                placeholder="작업자명"
                                                                onChange={(e) =>
                                                                    setSessions((prev) =>
                                                                        prev.map((s) =>
                                                                            s.sessionId === session.sessionId
                                                                                ? { ...s, workerName: e.target.value }
                                                                                : s
                                                                        )
                                                                    )
                                                                }
                                                                onBlur={() => {
                                                                    handleSessionEdit(session.sessionId, 'workerName', session.workerName || '');
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        handleSessionEdit(session.sessionId, 'workerName', session.workerName || '');
                                                                        e.target.blur();
                                                                    }
                                                                }}
                                                                className="h-8"
                                                                disabled={isViewer}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="truncate">
                                                            {Array.isArray(session.accountNames) && session.accountNames.length > 0 ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <Badge variant="secondary" className="font-normal text-xs">
                                                                            {session.accountNames[0]}
                                                                        </Badge>
                                                                        {session.accountNames.length > 1 && (
                                                                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                                                외 {session.accountNames.length - 1}개
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    '-'
                                                                )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {(session.totalRowCount || session.totalRows || (session.uploadedFiles?.reduce((sum, f) => sum + (f.rowCount || 0), 0)) || 0).toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="truncate">
                                                            {session.totalAmount
                                                                ? `${session.totalAmount.toLocaleString()} 원`
                                                                : '0 원'}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {session.analysisStatus === '완료' ? (
                                                                <Badge className="bg-sky-500">완료</Badge>
                                                            ) : session.analysisStatus === '진행중' ? (
                                                                <Badge variant="outline" className="border-yellow-500 text-yellow-700">진행중</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-muted-foreground">시작전</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                disabled={!session.isCompleted || !session.exportPath}
                                                                onClick={() => handleDownload(session.sessionId)}
                                                            >
                                                                <Download className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => {
                                                                    setResetTargetSession(session);
                                                                    setResetDialogOpen(true);
                                                                }}
                                                                disabled={isViewer}
                                                                title="세션 초기화"
                                                            >
                                                                <RotateCcw className="h-4 w-4 text-orange-500" />
                                                            </Button>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleDeleteSingleSession(session.sessionId)}
                                                                disabled={isViewer}
                                                            >
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </ScrollSyncTable>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* 하단 버튼 영역 */}
                    <div className="flex justify-end">
                        <Button
                            onClick={() => setCompleteDialogOpen(true)}
                            disabled={isViewer || Boolean(project?.isCompleted)}
                            className="bg-sky-500 hover:bg-sky-600"
                        >
                            {project?.isCompleted ? '프로젝트 완료됨' : '프로젝트 완료'}
                        </Button>
                    </div>
                </div>

                <PartitionDialog
                    open={partitionDialogOpen}
                    partitions={partitions}
                    onClose={() => setPartitionDialogOpen(false)}
                    onApprove={handlePartitionsApproved}
                />

                <ProgressDialog
                    open={progressDialogOpen}
                    message={progressMessage}
                    value={progressValue}
                />

                <ProgressDialog
                    open={isProcessing}
                    message="데이터를 분석하고 있습니다. 잠시만 기다려주세요..."
                />

                {/* 프로젝트 완료 확인 다이얼로그 */}
                <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>프로젝트 완료</DialogTitle>
                            <DialogDescription>
                                '프로젝트 완료' 처리 할 경우 진행 상태가 '완료' 처리 되지 않은 세션들은 일괄 삭제됩니다. '프로젝트 완료'처리를 수행하시겠습니까?
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>취소</Button>
                            <Button onClick={handleProjectComplete} className="bg-sky-500 hover:bg-sky-600">프로젝트 완료</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* 세션 초기화 확인 다이얼로그 */}
                <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <RotateCcw className="h-5 w-5 text-orange-500" />
                                세션 초기화
                            </DialogTitle>
                            <DialogDescription className="pt-2">
                                <strong>{resetTargetSession?.sessionName}</strong> 세션의 분석 데이터(session_data)를 모두 삭제하고 상태를 초기화합니다.
                                <br /><br />
                                <span className="text-red-500 font-medium">이 작업은 되돌릴 수 없습니다.</span>
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => { setResetDialogOpen(false); setResetTargetSession(null); }}>취소</Button>
                            <Button variant="destructive" onClick={handleResetSession}>초기화</Button>
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
                                선택한 <strong>{files.filter(f => f.checked).length}개 파일</strong>의 엑셀 데이터를 재분석합니다.
                                <br /><br />
                                기존 raw_data와 session_data가 삭제되고 엑셀 파일에서 데이터를 다시 추출합니다.
                                행 수가 0건으로 표시되는 문제를 해결할 수 있습니다.
                                <br /><br />
                                <span className="text-amber-600 font-medium">재분석 중에는 해당 파일의 데이터를 사용할 수 없습니다.</span>
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

export default MultiFileUploadPage;
