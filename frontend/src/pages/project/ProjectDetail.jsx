// frontend/src/pages/project/ProjectDetail.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    Typography,
    Tabs,
    Tab,
    Paper,
    Breadcrumbs,
    Link,
    CircularProgress,
    Alert,
    Chip
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import DashboardIcon from '@mui/icons-material/Dashboard';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import projectService from '../../services/projectService';
import FileUploadTab from '../../components/upload/FileUploadTab';
import styles from './ProjectDetail.module.css';

function ProjectDetail() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [currentTab, setCurrentTab] = useState(0);

    useEffect(() => {
        loadProject();
    }, [projectId]);

    const loadProject = async () => {
        try {
            setLoading(true);
            const data = await projectService.getProject(projectId);
            setProject(data);
        } catch (err) {
            setError('프로젝트를 불러오는데 실패했습니다.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleTabChange = (event, newValue) => {
        setCurrentTab(newValue);
    };

    if (loading) {
        return (
            <Container maxWidth="lg">
                <Box className={styles.loadingContainer}>
                    <CircularProgress />
                </Box>
            </Container>
        );
    }

    if (error || !project) {
        return (
            <Container maxWidth="lg">
                <Box className={styles.errorContainer}>
                    <Alert severity="error">{error || '프로젝트를 찾을 수 없습니다.'}</Alert>
                </Box>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg">
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
                    <Typography color="text.primary">{project.projectName}</Typography>
                </Breadcrumbs>

                {/* 프로젝트 헤더 */}
                <Paper className={styles.headerPaper}>
                    <Box className={styles.headerContent}>
                        <Box>
                            <Typography variant="h4" gutterBottom>
                                {project.projectName}
                            </Typography>
                            {project.description && (
                                <Typography variant="body1" className={styles.description}>
                                    {project.description}
                                </Typography>
                            )}
                            <Box className={styles.chipContainer}>
                                <Chip
                                    label={`세션: ${project.completedSessions || 0}/${project.totalSessions || 0}`}
                                    size="small"
                                />
                                <Chip
                                    label={`멤버: ${project.members?.length || 0}명`}
                                    size="small"
                                />
                                <Chip
                                    label={`생성일: ${new Date(project.createdAt).toLocaleDateString()}`}
                                    size="small"
                                />
                            </Box>
                        </Box>
                    </Box>
                </Paper>

                {/* 탭 네비게이션 */}
                <Paper className={styles.tabPaper}>
                    <Tabs value={currentTab} onChange={handleTabChange}>
                        <Tab icon={<DashboardIcon />} label="대시보드" iconPosition="start" />
                        <Tab icon={<UploadFileIcon />} label="파일 업로드" iconPosition="start" />
                    </Tabs>
                </Paper>

                {/* 탭 콘텐츠 */}
                <Box>
                    {currentTab === 0 && (
                        <Paper className={styles.contentPaper}>
                            <Typography variant="h6" gutterBottom>
                                프로젝트 대시보드
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                프로젝트 통계 및 최근 활동이 여기에 표시됩니다.
                            </Typography>
                        </Paper>
                    )}
                    {currentTab === 1 && (
                        <FileUploadTab projectId={projectId} />
                    )}
                </Box>
            </Box>
        </Container>
    );
}

export default ProjectDetail;