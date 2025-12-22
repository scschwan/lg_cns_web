import React, { useState, useEffect } from 'react';
import {
    Paper,
    Box,
    Typography,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    LinearProgress,
    Alert,
    Chip,
    IconButton, CircularProgress
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import uploadService from '../services/uploadService';

function FileUploadTab({ projectId }) {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadMessage, setUploadMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadFiles();
    }, [projectId]);

    const loadFiles = async () => {
        try {
            setLoading(true);
            const data = await uploadService.getProjectFiles(projectId);
            setFiles(data);
        } catch (err) {
            console.error('파일 목록 조회 오류:', err);
            setError('파일 목록을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = async (event) => {
        const selectedFiles = Array.from(event.target.files);

        // Excel 파일만 필터링
        const excelFiles = selectedFiles.filter(file =>
            file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
        );

        if (excelFiles.length === 0) {
            setError('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.');
            return;
        }

        if (excelFiles.length !== selectedFiles.length) {
            setError('일부 파일은 Excel 형식이 아니어서 제외되었습니다.');
        }

        setUploading(true);
        setError('');

        try {
            for (let i = 0; i < excelFiles.length; i++) {
                const file = excelFiles[i];

                setUploadMessage(`파일 업로드 중... (${i + 1}/${excelFiles.length}) ${file.name}`);

                await uploadService.uploadFileWithProgress(
                    projectId,
                    file,
                    (progress, message) => {
                        setUploadProgress(progress);
                        setUploadMessage(message);
                    }
                );
            }

            setUploadMessage('모든 파일 업로드 완료!');
            setTimeout(() => {
                setUploading(false);
                setUploadProgress(0);
                setUploadMessage('');
                loadFiles(); // 파일 목록 새로고침
            }, 1500);

        } catch (err) {
            console.error('파일 업로드 오류:', err);
            setError(err.message || '파일 업로드에 실패했습니다.');
            setUploading(false);
        }

        event.target.value = null; // 같은 파일 재선택 가능
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const getStatusChip = (status) => {
        switch (status) {
            case 'COMPLETED':
                return <Chip icon={<CheckCircleIcon />} label="완료" color="success" size="small" />;
            case 'PROCESSING':
                return <Chip label="처리 중" color="warning" size="small" />;
            case 'FAILED':
                return <Chip icon={<ErrorIcon />} label="실패" color="error" size="small" />;
            default:
                return <Chip label={status} size="small" />;
        }
    };

    return (
        <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6">
                    파일 업로드
                </Typography>
                <Button
                    variant="contained"
                    component="label"
                    startIcon={<UploadFileIcon />}
                    disabled={uploading}
                >
                    파일 선택
                    <input
                        type="file"
                        hidden
                        multiple
                        accept=".xlsx,.xls"
                        onChange={handleFileSelect}
                    />
                </Button>
            </Box>

            {/* 업로드 진행 상태 */}
            {uploading && (
                <Box sx={{ mb: 3 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        {uploadMessage}
                    </Typography>
                    <LinearProgress variant="determinate" value={uploadProgress} />
                    <Typography variant="caption" color="text.secondary">
                        {uploadProgress}%
                    </Typography>
                </Box>
            )}

            {/* 에러 메시지 */}
            {error && (
                <Alert severity="error" onClose={() => setError('')} sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {/* 파일 목록 */}
            <TableContainer>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>파일명</TableCell>
                            <TableCell>크기</TableCell>
                            <TableCell>상태</TableCell>
                            <TableCell>업로드 시간</TableCell>
                            <TableCell align="center">작업</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center">
                                    <CircularProgress size={24} />
                                </TableCell>
                            </TableRow>
                        ) : files.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center">
                                    <Typography variant="body2" color="text.secondary">
                                        업로드된 파일이 없습니다.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            files.map((file) => (
                                <TableRow key={file.uploadId}>
                                    <TableCell>{file.fileName}</TableCell>
                                    <TableCell>{formatFileSize(file.fileSize)}</TableCell>
                                    <TableCell>{getStatusChip(file.status)}</TableCell>
                                    <TableCell>
                                        {new Date(file.uploadedAt).toLocaleString()}
                                    </TableCell>
                                    <TableCell align="center">
                                        <IconButton size="small" color="error">
                                            <DeleteIcon />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
}

export default FileUploadTab;