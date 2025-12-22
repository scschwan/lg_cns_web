// frontend/src/pages/MultiFileUploadPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    Typography,
    Paper,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Breadcrumbs,
    Link,
    LinearProgress
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FolderIcon from '@mui/icons-material/Folder';
import uploadService from '../services/uploadService';
import projectService from '../services/projectService';

function MultiFileUploadPage() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        loadProject();
        loadFiles();
    }, [projectId]);

    const loadProject = async () => {
        const data = await projectService.getProject(projectId);
        setProject(data);
    };

    const loadFiles = async () => {
        const data = await uploadService.getProjectFiles(projectId);
        setFiles(data);
    };

    const handleFileSelect = async (event) => {
        const selectedFiles = Array.from(event.target.files);
        const excelFiles = selectedFiles.filter(file =>
            file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
        );

        setUploading(true);

        for (let i = 0; i < excelFiles.length; i++) {
            const file = excelFiles[i];

            await uploadService.uploadFileWithProgress(
                projectId,
                file,
                (progress, message) => {
                    setUploadProgress(progress);
                }
            );
        }

        setUploading(false);
        loadFiles(); // 새로고침
    };

    const handleFileClick = (file) => {
        // 세션 화면으로 이동
        navigate(`/projects/${projectId}/sessions/${file.sessionId}`);
    };

    return (
        <Container maxWidth="lg">
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
                    <Typography color="text.primary">파일 업로드</Typography>
                </Breadcrumbs>

                {/* 헤더 */}
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h5">
                            Multi File Upload
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

                    {/* 업로드 진행률 */}
                    {uploading && (
                        <Box sx={{ mt: 2 }}>
                            <LinearProgress variant="determinate" value={uploadProgress} />
                            <Typography variant="caption">{uploadProgress}%</Typography>
                        </Box>
                    )}
                </Paper>

                {/* 파일 목록 */}
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>파일명</TableCell>
                                <TableCell>크기</TableCell>
                                <TableCell>상태</TableCell>
                                <TableCell>업로드 시간</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {files.map((file) => (
                                <TableRow
                                    key={file.uploadId}
                                    onClick={() => handleFileClick(file)}
                                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                                >
                                    <TableCell>{file.fileName}</TableCell>
                                    <TableCell>
                                        {(file.fileSize / 1024 / 1024).toFixed(2)} MB
                                    </TableCell>
                                    <TableCell>{file.status}</TableCell>
                                    <TableCell>
                                        {new Date(file.createdAt).toLocaleString()}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>
        </Container>
    );
}

export default MultiFileUploadPage;