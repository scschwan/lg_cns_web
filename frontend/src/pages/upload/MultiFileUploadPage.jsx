// frontend/src/pages/upload/MultiFileUploadPage.jsx

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

import projectService from '../../services/projectService';
import uploadService from '../../services/uploadService';
import PartitionDialog from '../../components/upload/PartitionDialog'; // ⭐ 변경
import ProgressDialog from '../../components/common/ProgressDialog';
import styles from './MultiFileUploadPage.module.css'; // ⭐ 추가

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
            const data = await uploadService.getFiles(projectId);

            const filesWithId = data.map(file => ({
                ...file,
                id: file.fileId  // ⭐ DataGrid용 id 필드 추가
            }));
            setFiles(filesWithId);
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
    // 파일 업로드
    const handleFileUpload = async (event) => {  // ✅ event로 받기!
        // 이벤트 검증
        if (!event.target.files || event.target.files.length === 0) {
            console.error('파일이 선택되지 않았습니다.');
            alert('파일을 선택해주세요.');
            return;
        }

        const uploadedFiles = Array.from(event.target.files);  // ✅ 실제 파일 추출

        console.log('업로드된 파일:', uploadedFiles);

        // Excel 파일 필터링
        const excelFiles = uploadedFiles.filter(f =>
            f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
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
                const file = excelFiles[i];  // ✅ 실제 File 객체

                setProgressValue(((i + 1) / excelFiles.length) * 90);
                setProgressMessage(`파일 처리 중... (${i + 1}/${excelFiles.length})`);

                // 1. Excel 분석
                const excelData = await analyzeExcelColumns(file);  // ✅ File 객체 전달

                // 2. Presigned URL 요청
                const { presignedUrl, uploadId, sessionId, s3Key } =
                    await uploadService.getPresignedUrl(projectId, file.name, file.size);

                console.log('Presigned URL 응답:', {
                    uploadId,
                    sessionId,
                    s3Key
                });

                // 3. S3 업로드
                await uploadService.uploadToS3(presignedUrl, file);

                // 4. 파일 업로드 완료 처리
                const response = await uploadService.completeFileUpload(projectId, {
                    uploadId,
                    sessionId,
                    fileName: file.name,
                    fileSize: file.size,
                    s3Key
                });

                console.log('업로드 완료:', response);

                // 5. 파일 목록에 추가
                setFiles(prev => [...prev, {
                    ...response,
                    id: response.fileId,  // ⭐ id 필드 추가
                    detectedColumns: excelData.columns,
                    rowCount: excelData.rowCount
                }]);
            }

            setProgressValue(100);
            setProgressMessage('완료');
            setTimeout(() => setProgressDialogOpen(false), 500);

            alert(`${excelFiles.length}개의 파일이 성공적으로 업로드되었습니다.`);

            loadFiles();  // 파일 목록 새로고침

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

    const handleColumnSelect = async (fileId, columnType, columnName) => {
        try {
            console.log(`컬럼 선택: fileId=${fileId}, type=${columnType}, column=${columnName}`);

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

            console.log('컬럼 선택 완료:', updatedFileInfo);

            // ⭐ 핵심 수정: 백엔드 응답 그대로 State 업데이트
            setFiles(prev => prev.map(f =>
                f.fileId === fileId
                    ? {
                        ...f,
                        // ⭐ 백엔드에서 온 값 그대로 사용
                        accountColumnName: updatedFileInfo.accountColumnName || f.accountColumnName,
                        amountColumnName: updatedFileInfo.amountColumnName || f.amountColumnName,
                        accountContents: updatedFileInfo.accountContents || f.accountContents || [],
                        totalAmount: updatedFileInfo.totalAmount !== undefined
                            ? updatedFileInfo.totalAmount
                            : f.totalAmount
                    }
                    : f
            ));

            if (columnType === 'accountColumnName' && updatedFileInfo.accountContents) {
                console.log(`계정명 ${updatedFileInfo.accountContents.length}개 자동 추출 완료`);
            }
            if (columnType === 'amountColumnName' && updatedFileInfo.totalAmount) {
                console.log(`금액 합계: ${updatedFileInfo.totalAmount.toLocaleString()} 원`);
            }

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

        // 선택된 파일들 검증
        const invalidFiles = selectedFiles.filter(id => {
            const file = files.find(f => f.id === id);
            return !file.accountColumnName || !file.amountColumnName;
        });

        if (invalidFiles.length > 0) {
            alert('계정명과 금액 컬럼을 모두 선택해주세요.');
            return;
        }

        setProgressDialogOpen(true);
        setProgressMessage('파티션 분석 중...');

        try {
            // 계정명별 파티션 분석
            const result = await uploadService.analyzePartitions(
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
    const handlePartitionsApproved = async (approvedItems) => {
        // approvedItems: [{ partitionKey, count, fileIds, sessionName, workerName }, ...]

        setPartitionDialogOpen(false);
        setProgressDialogOpen(true);
        setProgressMessage('세션 생성 중...');

        try {
            // 백엔드 API가 { partitionKey, fileIds, sessionName, workerName } 형태를 받도록 구성되어 있다고 가정
            const createdSessions = await uploadService.createSessions(
                projectId,
                approvedItems // 사용자가 입력한 세션명, 작업자명이 포함된 배열 전달
            );

            // 생성된 세션이 0개인 경우 처리
            if (!createdSessions || createdSessions.length === 0) {
                alert('생성된 세션이 없습니다. 파일의 계정명 컬럼 내용을 확인해주세요.');
            } else {
                // 기존 세션 목록에 추가
                setSessions(prev => [...prev, ...createdSessions]);
                setSelectedFiles([]); // 선택 파일 초기화
                alert(`${createdSessions.length}개의 세션이 생성되었습니다.`);
            }
        } catch (error) {
            console.error('세션 생성 실패:', error);
            alert('세션 생성 중 오류가 발생했습니다.');
        } finally {
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
            await uploadService.addFilesToSession(
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
            await uploadService.mergeSessions(
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
            await uploadService.updateSession(projectId, sessionId, {
                sessionName: newName
            });

            setSessions(prev => prev.map(s =>
                s.sessionId  === sessionId
                    ? { ...s, sessionName: newName }
                    : s
            ));
        } catch (error) {
            console.error('세션명 수정 실패:', error);
        }
    };

    // ✅ [수정 1] 세션명 수정 핸들러 로직 개선
    // newRow: 수정된 전체 행 데이터, oldRow: 수정 전 데이터
    const handleProcessRowUpdate = async (newRow, oldRow) => {
        try {
            // 변경된 내용이 없으면 API 호출 생략
            if (newRow.sessionName === oldRow.sessionName && newRow.workerName === oldRow.workerName) {
                return oldRow;
            }

            // API 호출 (백엔드 DTO에 맞게 데이터 구성)
            // 백엔드 UpdateFileSessionRequest: { sessionName, workerName }
            await uploadService.updateSession(projectId, newRow.id || newRow.sessionId, {
                sessionName: newRow.sessionName,
                workerName: newRow.workerName
            });

            // 성공 시 수정된 행 반환 (화면 반영)
            return newRow;
        } catch (error) {
            console.error('세션 수정 실패:', error);
            alert('세션 정보를 수정하는 중 오류가 발생했습니다.');
            return oldRow; // 실패 시 이전 값으로 복구
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
            field: 'accountColumnName',
            headerName: '대계정 컬럼',
            width: 180,
            renderCell: (params) => (
                <select
                    // ⭐ 수정: params.row.accountColumnName을 직접 참조하여 상태 반영 확실하게 처리
                    value={params.row.accountColumnName || ''}
                    // 두 번째 인자 'accountColumn'은 handleColumnSelect 내부 분기용 문자열이므로 그대로 둠
                    onChange={(e) => handleColumnSelect(params.row.fileId, 'accountColumn', e.target.value)}
                    className={styles.columnSelect}
                >
                    <option value="">선택...</option>
                    {params.row.detectedColumns?.map(col => (
                        <option key={col} value={col}>{col}</option>
                    ))}
                </select>
            )
        },
        {
            field: 'amountColumnName',
            headerName: '금액 컬럼',
            width: 180,
            renderCell: (params) => (
                <select
                    // ⭐ 수정: params.row.amountColumnName을 직접 참조
                    value={params.row.amountColumnName || ''}
                    onChange={(e) => handleColumnSelect(params.row.fileId, 'amountColumn', e.target.value)}
                    className={styles.columnSelect}
                >
                    <option value="">선택...</option>
                    {params.row.detectedColumns?.map(col => (
                        <option key={col} value={col}>{col}</option>
                    ))}
                </select>
            )
        },
        {
            field: 'accountContents',
            headerName: '계정명 내용',
            width: 150,
            renderCell: (params) => (
                params.value?.length > 0
                    ? <Chip label={`${params.value} (${params.value.length}개)`} size="small" />
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
            editable: true // 편집 가능
        },
        {
            field: 'workerName',
            headerName: '작업자명',
            width: 120,
            editable: true // 편집 가능
        },
        {
            // ⭐ [수정] 백엔드는 accountNames(배열)을 주므로 첫 번째 요소를 가져오도록 처리
            field: 'accountName',
            headerName: '대계정',
            width: 120,
            valueGetter: (params) => {
                // 백엔드 필드명: accountNames (List<String>)
                const names = params.row.accountNames || params.row.accountName;
                if (Array.isArray(names) && names.length > 0) return names[0];
                return names || '-';
            }
        },
        {
            field: 'fileCount',
            headerName: '파일 수',
            width: 80,
            valueGetter: (params) => {
                // totalFiles 또는 uploadedFiles 배열 길이 확인
                return params.row.totalFiles || params.row.uploadedFiles?.length || 0;
            }
        },
        {
            field: 'totalRows',
            headerName: '행 수',
            width: 100,
            valueFormatter: (params) => (params.value || 0).toLocaleString()
        },
        {
            // ⭐ [수정] 합산금액 매핑
            field: 'totalAmount',
            headerName: '합산금액',
            width: 150,
            valueFormatter: (params) =>
                params.value ? `${params.value.toLocaleString()} 원` : '0 원'
        },
        {
            field: 'isCompleted',  // ⭐ status → isCompleted
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
                    disabled={!params.row.isCompleted || !params.row.exportPath}  // ⭐ 필드명 수정
                    onClick={() => handleDownload(params.row.sessionId)}
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
            await uploadService.deleteFile(projectId, fileId);
            setFiles(prev => prev.filter(f => f.id !== fileId));
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
        <Container maxWidth={false} className={styles.container}>
            <Box className={styles.contentWrapper}>
                {/* Breadcrumb */}
                <Breadcrumbs className={styles.breadcrumbs}>
                    <Link
                        underline="hover"
                        color="inherit"
                        onClick={() => navigate('/projects')}
                        className={styles.breadcrumbLink}
                    >
                        <FolderIcon className={styles.breadcrumbIcon} fontSize="small" />
                        내 프로젝트
                    </Link>
                    <Typography color="text.primary">{project?.projectName}</Typography>
                    <Typography color="text.primary">다중 파일 업로드</Typography>
                </Breadcrumbs>

                {/* 헤더 */}
                <Paper className={styles.headerPaper}>
                    <Grid container spacing={2}>
                        {/* 좌측: 제목 + 버튼 */}
                        <Grid item xs={12} md={7}>
                            <Typography variant="h5" className={styles.headerTitle}>
                                다중 파일 업로드
                            </Typography>
                            <Typography variant="body2" className={styles.headerDescription}>
                                여러 Excel 파일을 업로드하고 계정명/금액 컬럼을 선택한 후, 동일한 컬럼명끼리 세션을 생성하세요.
                            </Typography>
                            <Box className={styles.uploadButtonGroup}>
                                <Button
                                    variant="contained"
                                    component="label"
                                    startIcon={<UploadFileIcon />}
                                    className={styles.uploadButton}
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
                                    className={styles.createSessionButton}
                                >
                                    세션 생성
                                </Button>
                                <Button
                                    variant="contained"
                                    startIcon={<AddIcon />}
                                    onClick={handleAddToSession}
                                    className={styles.addToSessionButton}
                                    style={{ display: 'none' }}
                                >
                                    기존 세션 추가
                                </Button>
                            </Box>
                        </Grid>

                        {/* 우측: 세션 관리 버튼 */}
                        <Grid item xs={12} md={5}>
                            <Box className={styles.sessionButtonGroup}>
                                <Button
                                    variant="contained"
                                    startIcon={<MergeIcon />}
                                    onClick={handleMergeSessions}
                                    className={styles.mergeButton}
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
                                    className={styles.completeButton}
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
                        <Paper className={styles.tableWrapper}>
                            <Box className={styles.tableHeader}>
                                <Typography variant="h6" className={styles.tableTitle}>
                                    업로드된 파일 목록
                                </Typography>
                            </Box>
                            <DataGrid
                                rows={files}
                                columns={fileColumns}
                                getRowId={(row) => row.fileId}  // ⭐ 이 한 줄만 추가!
                                checkboxSelection
                                onRowSelectionModelChange={(ids) => setSelectedFiles(ids)}
                                rowSelectionModel={selectedFiles}
                                disableRowSelectionOnClick
                                hideFooter={files.length <= 10}
                                className={styles.dataGrid}
                            />
                        </Paper>
                    </Grid>

                    {/* 우측: 세션 목록 (40%) */}
                    <Grid item xs={12} md={5}>
                        <Paper className={styles.tableWrapper}>
                            <Box className={styles.tableHeader}>
                                <Typography variant="h6" className={styles.tableTitle}>
                                    생성된 세션 목록
                                </Typography>
                            </Box>
                            <DataGrid
                                rows={sessions}
                                columns={sessionColumns}
                                // ⭐ 핵심 수정: id가 확실히 있는지 확인하고, 없으면 index라도 사용 (undefined 방지)
                                //getRowId={(row) => row.id || row.sessionId || row._id || Math.random()}
                                getRowId={(row) => row.sessionId || row.id} // ⭐ ID 필드 명시
                                checkboxSelection
                                onRowSelectionModelChange={(ids) => setSelectedSessions(ids)}
                                rowSelectionModel={selectedSessions}
                                disableRowSelectionOnClick
                                /*
                                processRowUpdate={async (newRow) => {
                                    handleSessionNameEdit(newRow.sessionId, newRow.sessionName);  // ⭐ id → sessionId
                                    return newRow;
                                }}
                                */
                                processRowUpdate={handleProcessRowUpdate}
                                onProcessRowUpdateError={(error) => console.error('Row update error:', error)}
                                hideFooter={sessions.length <= 10}
                                className={styles.dataGrid}
                            />
                        </Paper>
                    </Grid>
                </Grid>

                {/* 다이얼로그들 */}
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
            </Box>
        </Container>
    );
}

export default MultiFileUploadPage;