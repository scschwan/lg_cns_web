// frontend/src/pages/upload/MultiFileUploadPage.jsx

import React, { useState, useEffect } from 'react';
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
            const data = await uploadService.getFiles(projectId);
            setFiles(data);
        } catch (error) {
            console.error('파일 로드 실패:', error);
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

    // 파일 업로드
    const handleFileUpload = async (event) => {
        if (!event.target.files || event.target.files.length === 0) {
            alert('파일을 선택해주세요.');
            return;
        }

        const uploadedFiles = Array.from(event.target.files);
        const excelFiles = uploadedFiles.filter(
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
            for (let i = 0; i < excelFiles.length; i++) {
                const file = excelFiles[i];

                setProgressValue(((i + 1) / excelFiles.length) * 90);
                setProgressMessage(`파일 처리 중... (${i + 1}/${excelFiles.length})`);

                // Excel 분석
                const excelData = await analyzeExcelColumns(file);

                // Presigned URL 요청
                const { presignedUrl, uploadId, sessionId, s3Key } =
                    await uploadService.getPresignedUrl(projectId, file.name, file.size);

                // S3 업로드
                await uploadService.uploadToS3(presignedUrl, file);

                // 업로드 완료 처리
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

            alert(`${excelFiles.length}개의 파일이 성공적으로 업로드되었습니다.`);
            loadFiles();
        } catch (error) {
            console.error('파일 업로드 실패:', error);
            alert(`파일 업로드 중 오류가 발생했습니다: ${error.message}`);
            setProgressDialogOpen(false);
        }
    };

    // Excel 컬럼 분석
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
        try {
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
        }
    };

    // 세션 생성
    const handleCreateSessions = async () => {
        if (selectedFiles.length === 0) {
            alert('세션을 생성할 파일을 선택해주세요.');
            return;
        }

        const invalidFiles = selectedFiles.filter((id) => {
            const file = files.find((f) => f.fileId === id);
            return !file.accountColumnName || !file.amountColumnName;
        });

        if (invalidFiles.length > 0) {
            alert('계정명과 금액 컬럼을 모두 선택해주세요.');
            return;
        }

        setProgressDialogOpen(true);
        setProgressMessage('파티션 분석 중...');

        try {
            const result = await uploadService.analyzePartitions(projectId, selectedFiles);
            setPartitions(result.partitions);
            setPartitionDialogOpen(true);
            setProgressDialogOpen(false);
        } catch (error) {
            console.error('파티션 분석 실패:', error);
            alert('파티션 분석 중 오류가 발생했습니다.');
            setProgressDialogOpen(false);
        }
    };

    // 세션 생성 승인
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

    // 세션 병합
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
            await uploadService.mergeSessions(projectId, selectedSessions);
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

    // 세션 삭제
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

    // 완료 (계정 분석 시작)
    const handleComplete = async () => {
        if (selectedSessions.length !== 1) {
            alert('처리할 세션을 1개만 선택해주세요.');
            return;
        }

        const confirmed = window.confirm(
            '선택된 세션을 처리하시겠습니까?\n\n' +
                '처리 내용:\n' +
                '• 기존 raw_data, process_data 컬렉션 초기화\n' +
                '• 세션별 계정명 데이터 추출 및 raw_data 저장\n' +
                '• 자동으로 파일 로드 화면으로 이동\n\n' +
                '※ 이 작업은 취소할 수 없습니다.'
        );

        if (!confirmed) return;

        setProgressDialogOpen(true);
        setProgressMessage('계정 분석 시작 중...');

        try {
            const sessionId = selectedSessions[0];
            await uploadService.completeSession(projectId, sessionId);

            setProgressDialogOpen(false);
            alert('계정 분석이 시작되었습니다. 파일 로드 화면으로 이동합니다.');

            navigate(`/projects/${projectId}/sessions/${sessionId}/fileload`);
        } catch (error) {
            console.error('완료 처리 실패:', error);
            alert('완료 처리 중 오류가 발생했습니다.');
            setProgressDialogOpen(false);
        }
    };

    // 세션 편집
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

        try {
            await uploadService.deleteFile(projectId, fileId);
            setFiles((prev) => prev.filter((f) => f.fileId !== fileId));
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
                            {/* 좌측 버튼 그룹 */}
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

                            {/* 우측 버튼 그룹 */}
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
                                    onClick={handleComplete}
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

                {/* ⭐ 수정 2: 그리드 비율 조정 (7:5) */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                    {/* 좌측: 파일 목록 (58%) */}
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
                                    /* ⭐ 수정 3: 테이블 스크롤 컨테이너 */
                                    <div className="border-t overflow-x-auto max-h-[700px] overflow-y-auto">
                                        {/* ⭐ 수정 4: 테이블 min-width 고정 */}
                                        <Table className="min-w-[1200px]">
                                            <TableHeader className="sticky top-0 bg-background z-10">
                                                <TableRow>
                                                    <TableHead className="w-12">
                                                        <Checkbox
                                                            checked={
                                                                selectedFiles.length === files.length &&
                                                                files.length > 0
                                                            }
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedFiles(
                                                                        files.map((f) => f.fileId)
                                                                    );
                                                                } else {
                                                                    setSelectedFiles([]);
                                                                }
                                                            }}
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
                                                    <TableHead className="w-[120px]">계정명</TableHead>
                                                    <TableHead className="w-[150px]">합산금액</TableHead>
                                                    <TableHead className="w-[80px]">삭제</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {files.map((file) => (
                                                    <TableRow key={file.fileId}>
                                                        <TableCell>
                                                            <Checkbox
                                                                checked={selectedFiles.includes(
                                                                    file.fileId
                                                                )}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) {
                                                                        setSelectedFiles((prev) => [
                                                                            ...prev,
                                                                            file.fileId,
                                                                        ]);
                                                                    } else {
                                                                        setSelectedFiles((prev) =>
                                                                            prev.filter(
                                                                                (id) => id !== file.fileId
                                                                            )
                                                                        );
                                                                    }
                                                                }}
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
                                                                    handleColumnSelect(
                                                                        file.fileId,
                                                                        'accountColumnName',
                                                                        value
                                                                    )
                                                                }
                                                            >
                                                                <SelectTrigger className="h-8">
                                                                    <SelectValue placeholder="선택..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {file.detectedColumns?.map(
                                                                        (col) => (
                                                                            <SelectItem
                                                                                key={col}
                                                                                value={col}
                                                                            >
                                                                                {col}
                                                                            </SelectItem>
                                                                        )
                                                                    )}
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Select
                                                                value={file.amountColumnName || ''}
                                                                onValueChange={(value) =>
                                                                    handleColumnSelect(
                                                                        file.fileId,
                                                                        'amountColumnName',
                                                                        value
                                                                    )
                                                                }
                                                            >
                                                                <SelectTrigger className="h-8">
                                                                    <SelectValue placeholder="선택..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {file.detectedColumns?.map(
                                                                        (col) => (
                                                                            <SelectItem
                                                                                key={col}
                                                                                value={col}
                                                                            >
                                                                                {col}
                                                                            </SelectItem>
                                                                        )
                                                                    )}
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell>
                                                            {file.accountContents?.length > 0 ? (
                                                                <Badge variant="secondary">
                                                                    {file.accountContents.length}개
                                                                </Badge>
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
                                                                onClick={() =>
                                                                    handleDeleteFile(file.fileId)
                                                                }
                                                            >
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* 우측: 세션 목록 (42%) */}
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
                                    /* ⭐ 수정 5: 세션 테이블 스크롤 */
                                    <div className="border-t overflow-x-auto max-h-[700px] overflow-y-auto">
                                        {/* ⭐ 수정 6: 세션 테이블 min-width */}
                                        <Table className="min-w-[1200px]">
                                            <TableHeader className="sticky top-0 bg-background z-10">
                                                <TableRow>
                                                    <TableHead className="w-12">
                                                        <Checkbox
                                                            checked={
                                                                selectedSessions.length ===
                                                                    sessions.length &&
                                                                sessions.length > 0
                                                            }
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedSessions(
                                                                        sessions.map((s) => s.sessionId)
                                                                    );
                                                                } else {
                                                                    setSelectedSessions([]);
                                                                }
                                                            }}
                                                        />
                                                    </TableHead>
                                                    <TableHead className="w-[180px]">세션명</TableHead>
                                                    <TableHead className="w-[100px]">작업자</TableHead>
                                                    <TableHead className="w-[120px]">대계정</TableHead>
                                                    <TableHead className="w-[80px] text-center">파일</TableHead>
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
                                                                checked={selectedSessions.includes(
                                                                    session.sessionId
                                                                )}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) {
                                                                        setSelectedSessions((prev) => [
                                                                            ...prev,
                                                                            session.sessionId,
                                                                        ]);
                                                                    } else {
                                                                        setSelectedSessions((prev) =>
                                                                            prev.filter(
                                                                                (id) =>
                                                                                    id !== session.sessionId
                                                                            )
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
                                                                                s.sessionId ===
                                                                                session.sessionId
                                                                                    ? {
                                                                                          ...s,
                                                                                          sessionName:
                                                                                              e.target
                                                                                                  .value,
                                                                                      }
                                                                                    : s
                                                                            )
                                                                        )
                                                                    }
                                                                    onBlur={() => {
                                                                        handleSessionEdit(
                                                                            session.sessionId,
                                                                            'sessionName',
                                                                            session.sessionName
                                                                        );
                                                                        setEditingSession(null);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            handleSessionEdit(
                                                                                session.sessionId,
                                                                                'sessionName',
                                                                                session.sessionName
                                                                            );
                                                                            setEditingSession(null);
                                                                        }
                                                                    }}
                                                                    className="h-8"
                                                                    autoFocus
                                                                />
                                                            ) : (
                                                                <div
                                                                    className="cursor-pointer hover:text-primary truncate"
                                                                    onDoubleClick={() =>
                                                                        setEditingSession(
                                                                            session.sessionId
                                                                        )
                                                                    }
                                                                    title={session.sessionName}
                                                                >
                                                                    {session.sessionName}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="truncate">
                                                            {session.workerName || '-'}
                                                        </TableCell>
                                                        <TableCell className="truncate">
                                                            {Array.isArray(session.accountNames)
                                                                ? session.accountNames[0]
                                                                : session.accountName || '-'}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {session.totalFiles ||
                                                                session.uploadedFiles?.length ||
                                                                0}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {(session.totalRows || 0).toLocaleString()}
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
                                                                <Badge variant="outline">
                                                                    진행중
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                disabled={
                                                                    !session.isCompleted ||
                                                                    !session.exportPath
                                                                }
                                                                onClick={() =>
                                                                    handleDownload(session.sessionId)
                                                                }
                                                            >
                                                                <Download className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Dialogs - 동일 */}
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
            </div>
        </div>
    );
}

export default MultiFileUploadPage;