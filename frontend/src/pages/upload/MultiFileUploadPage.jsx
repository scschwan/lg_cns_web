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

import projectService from '../../services/projectService';
import uploadService from '../../services/uploadService';
import PartitionDialog from '../../components/upload/PartitionDialog';
import ProgressDialog from '../../components/common/ProgressDialog';

/**
 * 가로 스크롤 동기화 테이블 래퍼
 * - 테이블 본체: 세로 스크롤 + 가로 스크롤(스크롤바 숨김)
 * - 바깥 스크롤바: 테이블 아래 고정, 양방향 동기화
 */
function ScrollSyncTable({ children, minWidth = '1200px', maxHeight = '700px' }) {
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

    // 상태 관리
    const [project, setProject] = useState(null);
    const [files, setFiles] = useState([]);
    const [sessions, setSessions] = useState([]);
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
            const initializedFiles = fileList.map(f => ({
                ...f,
                checked: false
            }));
            setFiles(initializedFiles);
        } catch (error) {
            console.error("파일 로드 실패", error);
        }
    };

    const loadSessions = async () => {
        try {
            const data = await uploadService.getSessions(projectId);
            setSessions(data);
        } catch (error) {
            console.error('세션 로드 실패:', error);
        }
    };

   const handleFileUpload = async (event) => {
       if (!event.target.files || event.target.files.length === 0) {
           alert('파일을 선택해주세요.');
           return;
       }

       const selectedFiles = Array.from(event.target.files);
       const excelFiles = selectedFiles.filter(
           (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
       );

       if (excelFiles.length === 0) {
           alert('Excel 파일(.xlsx, .xls)을 선택해주세요.');
           return;
       }

       setProgressDialogOpen(true);
       setProgressValue(0);
       setProgressMessage('파일 업로드 시작...');

       try {
           const uploadResults = [];

           for (let i = 0; i < excelFiles.length; i++) {
               const file = excelFiles[i];

               setProgressValue(((i + 1) / excelFiles.length) * 80);
               setProgressMessage(`파일 처리 중... (${i + 1}/${excelFiles.length})`);

               const { presignedUrl, uploadId, sessionId, s3Key } =
                   await uploadService.getPresignedUrl(projectId, file.name, file.size);

               await uploadService.uploadToS3(presignedUrl, file);

               const result = await uploadService.completeFileUpload(projectId, {
                   uploadId,
                   sessionId,
                   fileName: file.name,
                   fileSize: file.size,
                   s3Key,
               });

               uploadResults.push(result);
           }

           setProgressValue(100);
           setProgressMessage('완료');
           setTimeout(() => setProgressDialogOpen(false), 500);

           // 업로드 완료 후 파일 목록 새로고침
           alert(`${excelFiles.length}개의 파일이 성공적으로 업로드되었습니다.`);
           loadFiles();

       } catch (error) {
           console.error('파일 업로드 실패:', error);
           alert(`파일 업로드 중 오류가 발생했습니다: ${error.message}`);
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
            alert('컬럼 선택에 실패했습니다.');
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
            alert("세션을 생성할 파일을 선택해주세요.");
            return;
        }

        try {
            setIsProcessing(true);

            const fileIds = selectedFiles.map(f => f.fileId);
            const response = await uploadService.analyzePartitions(projectId, fileIds);

            const mappedPartitions = response.partitions.map((p) => ({
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
            alert("파일 분석 중 오류가 발생했습니다.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePartitionsApproved = async (approvedItems) => {
        setPartitionDialogOpen(false);
        setProgressDialogOpen(true);
        setProgressMessage('세션 생성 중...');

        try {
            const createdSessions = await uploadService.createSessions(
                projectId,
                approvedItems
            );

            if (!createdSessions || createdSessions.length === 0) {
                alert('생성된 세션이 없습니다.');
            } else {
                setSessions((prev) => [...prev, ...createdSessions]);
                setSelectedFiles([]);
                alert(`${createdSessions.length}개의 세션이 생성되었습니다.`);
            }
        } catch (error) {
            console.error('세션 생성 실패:', error);
            alert('세션 생성 중 오류가 발생했습니다.');
        } finally {
            setProgressDialogOpen(false);
        }
    };

    const handleMergeSessions = async () => {
        if (selectedSessions.length < 2) {
            alert('병합할 세션을 2개 이상 선택해주세요.');
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
            alert('세션 병합이 완료되었습니다.');
        } catch (error) {
            console.error('세션 병합 실패:', error);
            alert('세션 병합 중 오류가 발생했습니다.');
            setProgressDialogOpen(false);
        }
    };

    const handleDeleteSessions = async () => {
        if (selectedSessions.length === 0) {
            alert('삭제할 세션을 선택해주세요.');
            return;
        }

        const confirmed = window.confirm(
            `선택된 ${selectedSessions.length}개의 세션을 삭제하시겠습니까?`
        );

        if (!confirmed) return;

        try {
            await uploadService.deleteSessions(projectId, selectedSessions);
            loadSessions();
            setSelectedSessions([]);
            alert('세션이 삭제되었습니다.');
        } catch (error) {
            console.error('세션 삭제 실패:', error);
            alert('세션 삭제 중 오류가 발생했습니다.');
        }
    };

   const handleStartAnalysis = async () => {
       if (selectedSessions.length !== 1) return;

       const sessionId = selectedSessions[0];

       try {
           setProgressDialogOpen(true);
           setProgressValue(0);
           setProgressMessage('계정 분석을 시작합니다...');

           const result = await uploadService.startAccountAnalysis(projectId, sessionId);

           // 이미 완료된 경우 (기존 데이터 존재)
           if (result.status === 'COMPLETED' || result.skipped) {
               setProgressValue(100);
               setProgressMessage('완료');
               setProgressDialogOpen(false);
               alert(`기존 분석 데이터(${result.copiedCount}건)가 있습니다. 분석 페이지로 이동합니다.`);
               navigate(`/projects/${projectId}/sessions/${sessionId}/startanalysis`);
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
                       alert(`분석 실패: ${status.error || '알 수 없는 오류'}`);
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
           alert('분석 처리 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');

       } catch (error) {
           console.error('계정 분석 시작 실패:', error);
           setProgressDialogOpen(false);
           alert('계정 분석 시작 중 오류가 발생했습니다.');
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
            alert('파일 삭제 중 오류가 발생했습니다.');
        }
    };

    const handleDownload = async (sessionId) => {
        try {
            const url = await uploadService.downloadResult(projectId, sessionId);
            window.open(url, '_blank');
        } catch (error) {
            console.error('다운로드 실패:', error);
            alert('다운로드 중 오류가 발생했습니다.');
        }
    };

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
                                <Button asChild>
                                    <label className="cursor-pointer">
                                        <Upload className="h-4 w-4 mr-2" />
                                        Excel 파일 업로드
                                        <input
                                            type="file"
                                            hidden
                                            multiple
                                            accept=".xlsx,.xls"
                                            onChange={handleFileUpload}
                                        />
                                    </label>
                                </Button>
                                <Button onClick={handleCreateSessions} variant="default">
                                    <FolderOpen className="h-4 w-4 mr-2" />
                                    세션 생성
                                </Button>
                            </div>

                            <div className="flex gap-2 ml-auto">
                                <Button
                                    onClick={handleMergeSessions}
                                    variant="outline"
                                    disabled={selectedSessions.length < 2}
                                >
                                    <GitMerge className="h-4 w-4 mr-2" />
                                    세션 병합
                                </Button>
                                <Button
                                    onClick={handleDeleteSessions}
                                    variant="destructive"
                                    disabled={selectedSessions.length === 0}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    세션 삭제
                                </Button>
                                <Button
                                    onClick={handleStartAnalysis}
                                    disabled={selectedSessions.length !== 1}
                                    className="bg-green-600 hover:bg-green-700"
                                >
                                    <Play className="h-4 w-4 mr-2" />
                                    계정 분석 시작
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                    {/* 좌측: 파일 목록 */}
                    <div className="xl:col-span-7">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">업로드된 파일 목록</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {files.length === 0 ? (
                                    <div className="text-center py-12 px-6">
                                        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <p className="text-muted-foreground">
                                            업로드된 파일이 없습니다
                                        </p>
                                    </div>
                                ) : (
                                    <ScrollSyncTable minWidth="1200px" maxHeight="700px">
                                        <Table>
                                            <TableHeader className="sticky top-0 bg-background z-10">
                                                <TableRow>
                                                    <TableHead className="w-12">
                                                        <Checkbox
                                                            checked={files.length > 0 && files.every((f) => f.checked)}
                                                            onCheckedChange={(checked) => handleToggleAll(checked)}
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
                                                    <TableHead className="w-[80px]">삭제</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {files.map((file) => (
                                                    <TableRow key={file.fileId}>
                                                        <TableCell>
                                                            <Checkbox
                                                                checked={file.checked || false}
                                                                onCheckedChange={() => handleToggleCheck(file.fileId)}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="font-medium truncate">
                                                            {file.fileName}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {file.rowCount?.toLocaleString() || '0'}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Select
                                                                value={file.accountColumnName || ''}
                                                                onValueChange={(value) =>
                                                                    handleColumnSelect(file.fileId, 'accountColumnName', value)
                                                                }
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
                                                        </TableCell>
                                                        <TableCell>
                                                            <Select
                                                                value={file.amountColumnName || ''}
                                                                onValueChange={(value) =>
                                                                    handleColumnSelect(file.fileId, 'amountColumnName', value)
                                                                }
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

                    {/* 우측: 세션 목록 */}
                    <div className="xl:col-span-5">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">생성된 세션 목록</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {sessions.length === 0 ? (
                                    <div className="text-center py-12 px-6">
                                        <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <p className="text-muted-foreground">
                                            생성된 세션이 없습니다
                                        </p>
                                    </div>
                                ) : (
                                    <ScrollSyncTable minWidth="1200px" maxHeight="700px">
                                        <Table>
                                            <TableHeader className="sticky top-0 bg-background z-10">
                                                <TableRow>
                                                    <TableHead className="w-12">
                                                        <Checkbox
                                                            checked={
                                                                selectedSessions.length === sessions.length &&
                                                                sessions.length > 0
                                                            }
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedSessions(sessions.map((s) => s.sessionId));
                                                                } else {
                                                                    setSelectedSessions([]);
                                                                }
                                                            }}
                                                        />
                                                    </TableHead>
                                                    <TableHead className="w-[180px]">세션명</TableHead>
                                                    <TableHead className="w-[100px]">작업자</TableHead>
                                                    <TableHead className="w-[120px]">대계정</TableHead>
{/*                                                     <TableHead className="w-[80px] text-center">파일</TableHead> */}
                                                    <TableHead className="w-[100px] text-center">행수</TableHead>
                                                    <TableHead className="w-[130px]">합산금액</TableHead>
                                                    <TableHead className="w-[80px] text-center">완료</TableHead>
                                                    <TableHead className="w-[80px]">다운</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {sessions.map((session) => (
                                                    <TableRow key={session.sessionId}>
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
                                                                />
                                                            ) : (
                                                                <div
                                                                    className="cursor-pointer hover:text-primary truncate"
                                                                    onClick={() => setEditingSession(session.sessionId)}
                                                                    title="클릭하여 편집"
                                                                >
                                                                    {session.sessionName}
                                                                </div>
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
{/*                                                         <TableCell className="text-center"> */}
{/*                                                             {session.totalFiles || session.uploadedFiles?.length || 0} */}
{/*                                                         </TableCell> */}
                                                        <TableCell className="text-center">
                                                            {(session.totalRowCount || session.totalRows || 0).toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="truncate">
                                                            {session.totalAmount
                                                                ? `${session.totalAmount.toLocaleString()} 원`
                                                                : '0 원'}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {session.isCompleted ? (
                                                                <Badge>완료</Badge>
                                                            ) : (
                                                                <Badge variant="outline">진행중</Badge>
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
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </ScrollSyncTable>
                                )}
                            </CardContent>
                        </Card>
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
            </div>
        </div>
    );
}

export default MultiFileUploadPage;
