// frontend/src/components/upload/FileUploadSection.jsx

import React, { useState, useEffect } from 'react';
import {
    Paper,
    Box,
    Typography,
    Button,
    LinearProgress,
    Alert,
    Select,
    MenuItem,
    FormControl,
    Chip,
    IconButton,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Checkbox,
    TableContainer
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import AnalyticsIcon from '@mui/icons-material/Analytics';

import uploadService from '../../services/uploadService'; // ⭐ 변경
import PartitionDialog from './PartitionDialog';
import styles from './FileUploadSection.module.css';

function FileUploadSection({ projectId, refreshTrigger, onRefresh }) {
    const [files, setFiles] = useState([]);
    const [selectedFileIds, setSelectedFileIds] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState(null);
    const [partitionDialogOpen, setPartitionDialogOpen] = useState(false);
    const [partitions, setPartitions] = useState([]);

    useEffect(() => {
        loadFiles();
    }, [projectId, refreshTrigger]);

    const loadFiles = async () => {
        try {
            const data = await uploadService.getProjectFiles(projectId); // ⭐ 변경
            setFiles(data);
        } catch (error) {
            console.error('파일 목록 로드 실패:', error);
            setError('파일 목록을 불러올 수 없습니다.');
        }
    };

    // 파일 업로드
    const handleFileUpload = async (event) => {
        const uploadedFiles = Array.from(event.target.files);
        const excelFiles = uploadedFiles.filter(f =>
            f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
        );

        if (excelFiles.length === 0) {
            setError('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.');
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        setError(null);

        try {
            for (let i = 0; i < excelFiles.length; i++) {
                const file = excelFiles[i];
                setUploadProgress(Math.round(((i + 1) / excelFiles.length) * 100));

                await uploadService.uploadFile( // ⭐ 변경
                    projectId,
                    file,
                    null,
                    (progress) => {
                        console.log(`File ${i + 1} progress: ${progress}%`);
                    }
                );
            }

            setUploadProgress(100);
            setTimeout(() => {
                setUploading(false);
                setUploadProgress(0);
                loadFiles();
                onRefresh();
            }, 500);

        } catch (error) {
            console.error('파일 업로드 실패:', error);
            setError(`파일 업로드 실패: ${error.message}`);
            setUploading(false);
        }
    };

    // 파일 선택 토글
    const handleSelectFile = (fileId) => {
        setSelectedFileIds(prev =>
            prev.includes(fileId)
                ? prev.filter(id => id !== fileId)
                : [...prev, fileId]
        );
    };

    // 전체 선택/해제
    const handleSelectAll = () => {
        if (selectedFileIds.length === files.length) {
            setSelectedFileIds([]);
        } else {
            setSelectedFileIds(files.map(f => f.fileId));
        }
    };

    // 컬럼 설정
    const handleColumnChange = async (fileId, columnType, columnName) => {
        try {
            if (columnType === 'account') {
                await uploadService.setFileColumns( // ⭐ 변경
                    projectId,
                    fileId,
                    columnName,
                    null
                );
            } else {
                await uploadService.setFileColumns( // ⭐ 변경
                    projectId,
                    fileId,
                    null,
                    columnName
                );
            }

            loadFiles();
        } catch (error) {
            console.error('컬럼 설정 실패:', error);
            setError('컬럼 설정에 실패했습니다.');
        }
    };

    // 파일 분석 (파티션 생성)
    const handleAnalyze = async () => {
        if (selectedFileIds.length === 0) {
            setError('분석할 파일을 선택해주세요.');
            return;
        }

        const unsetFiles = selectedFileIds.filter(fileId => {
            const file = files.find(f => f.fileId === fileId);
            return !file.accountColumnName;
        });

        if (unsetFiles.length > 0) {
            setError('모든 파일의 계정명 컬럼을 선택해주세요.');
            return;
        }

        setError(null);

        try {
            const result = await uploadService.analyzeFiles( // ⭐ 변경
                projectId,
                selectedFileIds
            );

            setPartitions(result);
            setPartitionDialogOpen(true);

        } catch (error) {
            console.error('파일 분석 실패:', error);
            setError('파일 분석에 실패했습니다.');
        }
    };

    // 파티션 승인 → 세션 생성
    const handlePartitionsApproved = async (approvedPartitions) => {
        setPartitionDialogOpen(false);

        try {
            for (const partition of approvedPartitions) {
                await uploadService.createSession( // ⭐ 변경
                    projectId,
                    partition.sessionName,
                    partition.workerName || '',
                    partition.fileIds
                );
            }

            setSelectedFileIds([]);
            onRefresh();
            alert(`${approvedPartitions.length}개의 세션이 생성되었습니다.`);

        } catch (error) {
            console.error('세션 생성 실패:', error);
            setError('세션 생성에 실패했습니다.');
        }
    };

    return (
        <Paper className={styles.paper}>
            {/* 헤더 */}
            <Box className={styles.header}>
                <Typography variant="h6" className={styles.headerTitle}>
                    파일 업로드 및 관리
                </Typography>
            </Box>

            {/* 버튼 영역 */}
            <Box className={styles.buttonArea}>
                <Button
                    variant="contained"
                    component="label"
                    startIcon={<UploadFileIcon />}
                    disabled={uploading}
                    className={styles.uploadButton}
                >
                    Excel 업로드
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
                    startIcon={<AnalyticsIcon />}
                    onClick={handleAnalyze}
                    disabled={selectedFileIds.length === 0}
                    className={styles.analyzeButton}
                >
                    파일 분석
                </Button>
                <Box className={styles.selectionInfo}>
                    <Typography variant="caption" color="text.secondary">
                        선택: {selectedFileIds.length} / {files.length}
                    </Typography>
                </Box>
            </Box>

            {/* 업로드 진행률 */}
            {uploading && (
                <Box className={styles.progressArea}>
                    <LinearProgress variant="determinate" value={uploadProgress} />
                    <Typography variant="caption" className={styles.progressText}>
                        업로드 중... {uploadProgress}%
                    </Typography>
                </Box>
            )}

            {/* 에러 표시 */}
            {error && (
                <Alert severity="error" className={styles.errorAlert} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* 파일 테이블 */}
            <TableContainer className={styles.tableContainer}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    checked={files.length > 0 && selectedFileIds.length === files.length}
                                    indeterminate={selectedFileIds.length > 0 && selectedFileIds.length < files.length}
                                    onChange={handleSelectAll}
                                />
                            </TableCell>
                            <TableCell>파일명</TableCell>
                            <TableCell align="center" width={80}>행 수</TableCell>
                            <TableCell width={180}>계정명 컬럼</TableCell>
                            <TableCell width={180}>금액 컬럼</TableCell>
                            <TableCell align="center" width={100}>상태</TableCell>
                            <TableCell align="center" width={60}>삭제</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {files.map((file) => (
                            <TableRow
                                key={file.fileId}
                                selected={selectedFileIds.includes(file.fileId)}
                                className={styles.tableRow}
                            >
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        checked={selectedFileIds.includes(file.fileId)}
                                        onChange={() => handleSelectFile(file.fileId)}
                                    />
                                </TableCell>
                                <TableCell>{file.fileName}</TableCell>
                                <TableCell align="center">
                                    {file.rowCount?.toLocaleString() || '-'}
                                </TableCell>
                                <TableCell>
                                    <FormControl fullWidth size="small">
                                        <Select
                                            value={file.accountColumnName || ''}
                                            onChange={(e) => handleColumnChange(
                                                file.fileId, 'account', e.target.value
                                            )}
                                            displayEmpty
                                        >
                                            <MenuItem value="">선택...</MenuItem>
                                            {file.detectedColumns?.map(col => (
                                                <MenuItem key={col} value={col}>{col}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    <FormControl fullWidth size="small">
                                        <Select
                                            value={file.amountColumnName || ''}
                                            onChange={(e) => handleColumnChange(
                                                file.fileId, 'amount', e.target.value
                                            )}
                                            displayEmpty
                                        >
                                            <MenuItem value="">선택...</MenuItem>
                                            {file.detectedColumns?.map(col => (
                                                <MenuItem key={col} value={col}>{col}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell align="center">
                                    <Chip
                                        label={file.status || 'UPLOADED'}
                                        size="small"
                                        color={file.status === 'COMPLETED' ? 'success' : 'default'}
                                    />
                                </TableCell>
                                <TableCell align="center">
                                    <IconButton size="small" color="error">
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {files.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} align="center" className={styles.emptyCell}>
                                    <Typography variant="body2" color="text.secondary">
                                        업로드된 파일이 없습니다.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* 파티션 다이얼로그 */}
            <PartitionDialog
                open={partitionDialogOpen}
                partitions={partitions}
                onClose={() => setPartitionDialogOpen(false)}
                onApprove={handlePartitionsApproved}
            />
        </Paper>
    );
}

export default FileUploadSection;