// frontend/src/pages/project/ProjectSettingsPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Alert,
    CircularProgress,
    Divider,
    Chip
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DescriptionIcon from '@mui/icons-material/Description';

import projectService from '../../services/projectService';

const ProjectSettingsPage = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [projectName, setProjectName] = useState('');
    const [projectDescription, setProjectDescription] = useState('');

    // ⭐ 신규 추가: 파일 목록 상태
    const [files, setFiles] = useState([]);
    const [filesLoading, setFilesLoading] = useState(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');

    // 프로젝트 정보 로드
    useEffect(() => {
        loadProjectData();
    }, [projectId]);

    const loadProjectData = async () => {
        try {
            setLoading(true);
            setError(null);

            // 프로젝트 정보 로드
            const projectData = await projectService.getProject(projectId);
            setProject(projectData);
            setProjectName(projectData.name);
            setProjectDescription(projectData.description || '');

            // ⭐ 파일 목록 로드
            await loadProjectFiles();

        } catch (err) {
            console.error('프로젝트 정보 로드 실패:', err);
            setError('프로젝트 정보를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // ⭐ 신규 추가: 파일 목록 로드
    const loadProjectFiles = async () => {
        try {
            setFilesLoading(true);
            const filesData = await projectService.getProjectFiles(projectId);

            // DataGrid용 데이터 변환
            const formattedFiles = filesData.map((file, index) => ({
                id: file.id || index,
                fileName: file.fileName,
                fileSize: formatFileSize(file.fileSize),
                columnCount: file.detectedColumns?.length || 0,
                uploadedAt: formatDate(file.uploadedAt),
                accountColumn: file.accountColumnName || '-',
                amountColumn: file.amountColumnName || '-'
            }));

            setFiles(formattedFiles);
        } catch (err) {
            console.error('파일 목록 로드 실패:', err);
            // 파일 목록 로드 실패는 치명적이지 않으므로 에러 무시
        } finally {
            setFilesLoading(false);
        }
    };

    // 파일 크기 포맷팅
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    // 날짜 포맷팅
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // 프로젝트 저장
    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            setSuccessMessage('');

            await projectService.updateProject(projectId, {
                name: projectName,
                description: projectDescription
            });

            setSuccessMessage('프로젝트 정보가 저장되었습니다.');

            // 3초 후 메시지 자동 제거
            setTimeout(() => setSuccessMessage(''), 3000);

        } catch (err) {
            console.error('프로젝트 저장 실패:', err);
            setError('프로젝트 정보 저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    // ⭐ 파일 목록 DataGrid 컬럼 정의
    const fileColumns = [
        {
            field: 'fileName',
            headerName: '파일명',
            flex: 2,
            minWidth: 200
        },
        {
            field: 'fileSize',
            headerName: '크기',
            width: 100,
            align: 'right'
        },
        {
            field: 'columnCount',
            headerName: '컬럼 수',
            width: 100,
            align: 'center'
        },
        {
            field: 'accountColumn',
            headerName: '계정명 컬럼',
            flex: 1,
            minWidth: 150
        },
        {
            field: 'amountColumn',
            headerName: '금액 컬럼',
            flex: 1,
            minWidth: 150
        },
        {
            field: 'uploadedAt',
            headerName: '업로드 시간',
            flex: 1,
            minWidth: 150
        }
    ];

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* 헤더 */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/projects')}
                    sx={{ mr: 2 }}
                >
                    프로젝트 목록
                </Button>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    프로젝트 설정
                </Typography>
            </Box>

            {/* 에러/성공 메시지 */}
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {successMessage && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>
                    {successMessage}
                </Alert>
            )}

            {/* 프로젝트 기본 정보 */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                    기본 정보
                </Typography>

                <TextField
                    fullWidth
                    label="프로젝트 이름"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    sx={{ mb: 2 }}
                    required
                />

                <TextField
                    fullWidth
                    label="프로젝트 설명"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    multiline
                    rows={3}
                    sx={{ mb: 2 }}
                />

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={handleSave}
                        disabled={saving || !projectName.trim()}
                    >
                        {saving ? '저장 중...' : '저장'}
                    </Button>
                </Box>
            </Paper>

            {/* ⭐ 신규 추가: 업로드된 파일 목록 */}
            <Paper sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <DescriptionIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        업로드된 파일
                    </Typography>
                    <Chip
                        label={`${files.length}개`}
                        size="small"
                        sx={{ ml: 1 }}
                        color="primary"
                    />
                </Box>

                <Divider sx={{ mb: 2 }} />

                {filesLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : files.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        <DescriptionIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
                        <Typography>
                            업로드된 파일이 없습니다.
                        </Typography>
                    </Box>
                ) : (
                    <DataGrid
                        rows={files}
                        columns={fileColumns}
                        pageSize={10}
                        rowsPerPageOptions={[10, 25, 50]}
                        autoHeight
                        disableSelectionOnClick
                        sx={{
                            '& .MuiDataGrid-row:hover': {
                                backgroundColor: 'action.hover'
                            }
                        }}
                    />
                )}
            </Paper>
        </Box>
    );
};

export default ProjectSettingsPage;