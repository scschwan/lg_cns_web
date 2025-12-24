// frontend/src/pages/MultiFileUploadPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    Typography,
    Paper,
    Button,
    Breadcrumbs,
    Link,
    Grid,
    Chip
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FolderIcon from '@mui/icons-material/Folder';
import DeleteIcon from '@mui/icons-material/Delete';
import MergeIcon from '@mui/icons-material/MergeType';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import * as XLSX from 'xlsx';

import projectService from '../services/projectService';
import multiFileUploadService from '../services/multiFileUploadService';
import SessionPartitionDialog from '../components/upload/SessionPartitionDialog';
import ProgressDialog from '../components/common/ProgressDialog';

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
            const data = await multiFileUploadService.getFiles(projectId);
            setFiles(data);
        } catch (error) {
            console.error('파일 로드 실패:', error);
        }
    };

    const loadSessions = async () => {
        try {
            const data = await multiFileUploadService.getSessions(projectId);
            setSessions(data);
        } catch (error) {
            console.error('세션 로드 실패:', error);
        }
    };

    // 파일 업로드
    const handleFileUpload = async (event) => {
        const uploadedFiles = Array.from(event.target.files);
        const excelFiles = uploadedFiles.filter(f =>
            f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
        );

        setProgressDialogOpen(true);
        setProgressValue(0);
        setProgressMessage('파일 업로드 시작...');

        try {
            for (let i = 0; i < excelFiles.length; i++) {
                const file = excelFiles[i];
                setProgressValue(((i + 1) / excelFiles.length) * 90);
                setProgressMessage(`파일 처리 중... (${i + 1}/${excelFiles.length})`);

                // Excel 컬럼 분석
                const columns = await analyzeExcelColumns(file);

                // S3 업로드
                const uploadedFile = await multiFileUploadService.uploadFile(
                    projectId,
                    file,
                    columns
                );

                setFiles(prev => [...prev, uploadedFile]);
            }

            setProgressValue(100);
            setProgressMessage('완료');
            setTimeout(() => setProgressDialogOpen(false), 500);

            alert(`${excelFiles.length}개의 파일이 성공적으로 업로드되었습니다.`);
        } catch (error) {
            console.error('파일 업로드 실패:', error);
            alert('파일 업로드 중 오류가 발생했습니다.');
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

                    // 첫 행을 컬럼으로 사용
                    const columns = jsonData[0] || [];
                    const rowCount = jsonData.length - 1;

                    resolve({
                        columns: columns.filter(c => c),
                        rowCount
                    });
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    // 계정명/금액 컬럼 선택
    const handleColumnSelect = async (fileId, columnType, columnName) => {
        try {
            await multiFileUploadService.updateFileColumns(projectId, fileId, {
                [columnType]: columnName
            });

            // 로컬 상태 업데이트
            setFiles(prev => prev.map(f =>
                f.id === fileId
                    ? { ...f, [columnType]: columnName }
                    : f
            ));

            // 계정명/금액 자동 추출
            if (columnType === 'accountColumn') {
                await extractAccountValues(fileId, columnName);
            } else if (columnType === 'amountColumn') {
                await calculateTotalAmount(fileId, columnName);
            }
        } catch (error) {
            console.error('컬럼 선택 실패:', error);
        }
    };

    // 계정명 추출
    const extractAccountValues = async (fileId, columnName) => {
        try {
            const accounts = await multiFileUploadService.extractAccountValues(
                projectId,
                fileId,
                columnName
            );

            setFiles(prev => prev.map(f =>
                f.id === fileId
                    ? { ...f, accountValues: accounts }
                    : f
            ));
        } catch (error) {
            console.error('계정명 추출 실패:', error);
        }
    };

    // 금액 합산
    const calculateTotalAmount = async (fileId, columnName) => {
        try {
            const totalAmount = await multiFileUploadService.calculateTotalAmount(
                projectId,
                fileId,
                columnName
            );

            setFiles(prev => prev.map(f =>
                f.id === fileId
                    ? { ...f, totalAmount }
                    : f
            ));
        } catch (error) {
            console.error('금액 계산 실패:', error);
        }
    };

    // 세션 생성
    const handleCreateSessions = async () => {
        if (selectedFiles.length === 0) {
            alert('세션을 생성할 파일을 선택해주세요.');
            return;
        }

        // 선택된 파일들 검증
        const invalidFiles = selectedFiles.filter(id => {
            const file = files.find(f => f.id === id);
            return !file.accountColumn || !file.amountColumn;
        });

        if (invalidFiles.length > 0) {
            alert('계정명과 금액 컬럼을 모두 선택해주세요.');
            return;
        }

        setProgressDialogOpen(true);
        setProgressMessage('파티션 분석 중...');

        try {
            // 계정명별 파티션 분석
            const result = await multiFileUploadService.analyzePartitions(
                projectId,
                selectedFiles
            );

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
    const handlePartitionsApproved = async (approvedPartitions) => {
        setPartitionDialogOpen(false);
        setProgressDialogOpen(true);
        setProgressMessage('세션 생성 중...');

        try {
            const createdSessions = await multiFileUploadService.createSessions(
                projectId,
                approvedPartitions
            );

            setSessions(prev => [...prev, ...createdSessions]);
            setSelectedFiles([]);

            setProgressDialogOpen(false);
            alert(`${createdSessions.length}개의 세션이 생성되었습니다.`);
        } catch (error) {
            console.error('세션 생성 실패:', error);
            alert('세션 생성 중 오류가 발생했습니다.');
            setProgressDialogOpen(false);
        }
    };

    // 세션에 파일 추가
    const handleAddToSession = async () => {
        if (selectedFiles.length === 0) {
            alert('추가할 파일을 선택해주세요.');
            return;
        }

        if (selectedSessions.length !== 1) {
            alert('파일을 추가할 세션을 하나만 선택해주세요.');
            return;
        }

        const targetSessionId = selectedSessions[0];

        try {
            await multiFileUploadService.addFilesToSession(
                projectId,
                targetSessionId,
                selectedFiles
            );

            loadSessions();
            setSelectedFiles([]);
            alert('파일이 세션에 추가되었습니다.');
        } catch (error) {
            console.error('세션에 파일 추가 실패:', error);
            alert('세션에 파일 추가 중 오류가 발생했습니다.');
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
            await multiFileUploadService.mergeSessions(
                projectId,
                selectedSessions
            );

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
            await multiFileUploadService.deleteSessions(projectId, selectedSessions);
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
            await multiFileUploadService.completeSession(projectId, sessionId);

            setProgressDialogOpen(false);
            alert('계정 분석이 시작되었습니다. 파일 로드 화면으로 이동합니다.');

            // 파일 로드 화면으로 이동 (향후 구현)
            // navigate(`/projects/${projectId}/sessions/${sessionId}/fileload`);
        } catch (error) {
            console.error('완료 처리 실패:', error);
            alert('완료 처리 중 오류가 발생했습니다.');
            setProgressDialogOpen(false);
        }
    };

    // 세션명 편집
    const handleSessionNameEdit = async (sessionId, newName) => {
        try {
            await multiFileUploadService.updateSession(projectId, sessionId, {
                sessionName: newName
            });

            setSessions(prev => prev.map(s =>
                s.id === sessionId
                    ? { ...s, sessionName: newName }
                    : s
            ));
        } catch (error) {
            console.error('세션명 수정 실패:', error);
        }
    };

    // 파일 테이블 컬럼 정의
    const fileColumns = [
        {
            field: 'fileName',
            headerName: '파일명',
            flex: 1,
            minWidth: 300
        },
        {
            field: 'rowCount',
            headerName: '행 수',
            width: 100,
            valueFormatter: (params) => params.value?.toLocaleString() || '0'
        },
        {
            field: 'accountColumn',
            headerName: '대계정 컬럼',
            width: 180,
            renderCell: (params) => (
                <select
                    value={params.value || ''}
                    onChange={(e) => handleColumnSelect(params.row.id, 'accountColumn', e.target.value)}
                    style={{ width: '100%', padding: '4px' }}
                >
                    <option value="">선택...</option>
                    {params.row.detectedColumns?.map(col => (
                        <option key={col} value={col}>{col}</option>
                    ))}
                </select>
            )
        },
        {
            field: 'amountColumn',
            headerName: '금액 컬럼',
            width: 180,
            renderCell: (params) => (
                <select
                    value={params.value || ''}
                    onChange={(e) => handleColumnSelect(params.row.id, 'amountColumn', e.target.value)}
                    style={{ width: '100%', padding: '4px' }}
                >
                    <option value="">선택...</option>
                    {params.row.detectedColumns?.map(col => (
                        <option key={col} value={col}>{col}</option>
                    ))}
                </select>
            )
        },
        {
            field: 'accountValues',
            headerName: '계정명 내용',
            width: 150,
            renderCell: (params) => (
                params.value?.length > 0
                    ? <Chip label={`${params.value.length}개`} size="small" />
                    : '-'
            )
        },
        {
            field: 'totalAmount',
            headerName: '합산금액',
            width: 150,
            valueFormatter: (params) =>
                params.value ? `${params.value.toLocaleString()} 원` : '-'
        },
        {
            field: 'actions',
            headerName: '삭제',
            width: 80,
            renderCell: (params) => (
                <Button
                    size="small"
                    color="error"
                    onClick={() => handleDeleteFile(params.row.id)}
                >
                    <DeleteIcon fontSize="small" />
                </Button>
            )
        }
    ];

    // 세션 테이블 컬럼 정의
    const sessionColumns = [
        {
            field: 'sessionName',
            headerName: '세션명',
            flex: 1,
            minWidth: 150,
            editable: true
        },
        {
            field: 'workerName',
            headerName: '작업자명',
            width: 120,
            editable: true
        },
        {
            field: 'accountName',
            headerName: '대계정',
            width: 120
        },
        {
            field: 'fileCount',
            headerName: '파일 수',
            width: 80
        },
        {
            field: 'totalRows',
            headerName: '행 수',
            width: 100,
            valueFormatter: (params) => params.value?.toLocaleString() || '0'
        },
        {
            field: 'totalAmount',
            headerName: '합산금액',
            width: 150,
            valueFormatter: (params) =>
                params.value ? `${params.value.toLocaleString()} 원` : '-'
        },
        {
            field: 'status',
            headerName: '완료',
            width: 80,
            type: 'boolean'
        },
        {
            field: 'download',
            headerName: '다운로드',
            width: 100,
            renderCell: (params) => (
                <Button
                    size="small"
                    disabled={!params.row.status || !params.row.resultFilePath}
                    onClick={() => handleDownload(params.row.id)}
                >
                    📥
                </Button>
            )
        }
    ];

    const handleDeleteFile = async (fileId) => {
        const confirmed = window.confirm('파일을 삭제하시겠습니까?');
        if (!confirmed) return;

        try {
            await multiFileUploadService.deleteFile(projectId, fileId);
            setFiles(prev => prev.filter(f => f.id !== fileId));
        } catch (error) {
            console.error('파일 삭제 실패:', error);
            alert('파일 삭제 중 오류가 발생했습니다.');
        }
    };

    const handleDownload = async (sessionId) => {
        try {
            const url = await multiFileUploadService.downloadResult(projectId, sessionId);
            window.open(url, '_blank');
        } catch (error) {
            console.error('다운로드 실패:', error);
            alert('다운로드 중 오류가 발생했습니다.');
        }
    };

    return (
        <Container maxWidth={false} sx={{ maxWidth: '1920px' }}>
            <Box sx={{ mt: 4, mb: 4 }}>
                {/* Breadcrumb */}
                <Breadcrumbs sx={{ mb: 2 }}>
                    <Link
                        underline="hover"
                        color="inherit"
                        onClick={() => navigate('/projects')}
                        sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        <FolderIcon sx={{ mr: 0.5 }} fontSize="small" />
                        내 프로젝트
                    </Link>
                    <Typography color="text.primary">{project?.projectName}</Typography>
                    <Typography color="text.primary">다중 파일 업로드</Typography>
                </Breadcrumbs>

                {/* 헤더 */}
                <Paper sx={{ p: 3, mb: 3, bgcolor: '#f5f5f5' }}>
                    <Grid container spacing={2}>
                        {/* 좌측: 제목 + 버튼 */}
                        <Grid item xs={12} md={7}>
                            <Typography variant="h5" fontWeight="bold" color="darkslategray" gutterBottom>
                                다중 파일 업로드
                            </Typography>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                여러 Excel 파일을 업로드하고 계정명/금액 컬럼을 선택한 후, 동일한 컬럼명끼리 세션을 생성하세요.
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                                <Button
                                    variant="contained"
                                    component="label"
                                    startIcon={<UploadFileIcon />}
                                    sx={{ bgcolor: 'dodgerblue' }}
                                >
                                    Excel 파일 업로드
                                    <input
                                        type="file"
                                        hidden
                                        multiple
                                        accept=".xlsx,.xls"
                                        onChange={handleFileUpload}
                                    />
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={handleCreateSessions}
                                    sx={{ bgcolor: 'orange' }}
                                >
                                    세션 생성
                                </Button>
                                <Button
                                    variant="contained"
                                    startIcon={<AddIcon />}
                                    onClick={handleAddToSession}
                                    sx={{ bgcolor: 'indianred', display: 'none' }}
                                >
                                    기존 세션 추가
                                </Button>
                            </Box>
                        </Grid>

                        {/* 우측: 세션 관리 버튼 */}
                        <Grid item xs={12} md={5}>
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 6 }}>
                                <Button
                                    variant="contained"
                                    startIcon={<MergeIcon />}
                                    onClick={handleMergeSessions}
                                    sx={{ bgcolor: 'orange' }}
                                >
                                    세션 병합
                                </Button>
                                <Button
                                    variant="contained"
                                    color="error"
                                    startIcon={<DeleteIcon />}
                                    onClick={handleDeleteSessions}
                                >
                                    세션 삭제
                                </Button>
                                <Button
                                    variant="contained"
                                    startIcon={<PlayArrowIcon />}
                                    onClick={handleComplete}
                                    sx={{ bgcolor: 'limegreen' }}
                                >
                                    계정 분석 시작
                                </Button>
                            </Box>
                        </Grid>
                    </Grid>
                </Paper>

                {/* 콘텐츠: 2개 테이블 */}
                <Grid container spacing={2}>
                    {/* 좌측: 파일 목록 (60%) */}
                    <Grid item xs={12} md={7}>
                        <Paper sx={{ height: 700 }}>
                            <Box sx={{ bgcolor: 'steelblue', color: 'white', p: 1.5, textAlign: 'center' }}>
                                <Typography variant="h6" fontWeight="bold">
                                    업로드된 파일 목록
                                </Typography>
                            </Box>
                            <DataGrid
                                rows={files}
                                columns={fileColumns}
                                checkboxSelection
                                onRowSelectionModelChange={(ids) => setSelectedFiles(ids)}
                                rowSelectionModel={selectedFiles}
                                disableRowSelectionOnClick
                                hideFooter={files.length <= 10}
                                sx={{
                                    '& .MuiDataGrid-columnHeaders': {
                                        bgcolor: 'lightsteelblue',
                                        fontWeight: 'bold'
                                    },
                                    '& .MuiDataGrid-row:nth-of-type(even)': {
                                        bgcolor: 'aliceblue'
                                    }
                                }}
                            />
                        </Paper>
                    </Grid>

                    {/* 우측: 세션 목록 (40%) */}
                    <Grid item xs={12} md={5}>
                        <Paper sx={{ height: 700 }}>
                            <Box sx={{ bgcolor: 'steelblue', color: 'white', p: 1.5, textAlign: 'center' }}>
                                <Typography variant="h6" fontWeight="bold">
                                    생성된 세션 목록
                                </Typography>
                            </Box>
                            <DataGrid
                                rows={sessions}
                                columns={sessionColumns}
                                checkboxSelection
                                onRowSelectionModelChange={(ids) => setSelectedSessions(ids)}
                                rowSelectionModel={selectedSessions}
                                disableRowSelectionOnClick
                                processRowUpdate={(newRow) => {
                                    handleSessionNameEdit(newRow.id, newRow.sessionName);
                                    return newRow;
                                }}
                                hideFooter={sessions.length <= 10}
                                sx={{
                                    '& .MuiDataGrid-columnHeaders': {
                                        bgcolor: 'lightsteelblue',
                                        fontWeight: 'bold'
                                    },
                                    '& .MuiDataGrid-row:nth-of-type(even)': {
                                        bgcolor: 'aliceblue'
                                    }
                                }}
                            />
                        </Paper>
                    </Grid>
                </Grid>

                {/* 다이얼로그들 */}
                <SessionPartitionDialog
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
            </Box>
        </Container>
    );
}

export default MultiFileUploadPage;