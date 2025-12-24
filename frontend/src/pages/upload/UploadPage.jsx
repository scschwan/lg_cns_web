// frontend/src/pages/upload/UploadPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    Typography,
    Paper,
    Breadcrumbs,
    Link,
    Grid,
    Alert
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';

import projectService from '../../services/projectService';
import FileUploadSection from '../../components/upload/FileUploadSection';
import SessionListSection from '../../components/upload/SessionListSection';
import styles from './UploadPage.module.css';

/**
 * Step 1: Multi File Upload - 메인 페이지
 */
function UploadPage() {
    const { projectId } = useParams();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadProject();
    }, [projectId]);

    const loadProject = async () => {
        try {
            const data = await projectService.getProject(projectId);
            setProject(data);
        } catch (error) {
            console.error('프로젝트 로드 실패:', error);
            setError('프로젝트를 불러올 수 없습니다.');
        }
    };

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <Container maxWidth={false} className={styles.container}>
            <Box className={styles.contentWrapper}>
                {/* Breadcrumb */}
                <Breadcrumbs className={styles.breadcrumb}>
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
                    <Typography color="text.primary">파일 업로드</Typography>
                </Breadcrumbs>

                {/* 에러 표시 */}
                {error && (
                    <Alert severity="error" className={styles.errorAlert}>
                        {error}
                    </Alert>
                )}

                {/* 헤더 */}
                <Paper className={styles.header}>
                    <Typography variant="h5" className={styles.headerTitle}>
                        Step 1: Multi File Upload
                    </Typography>
                    <Typography variant="body2" className={styles.headerDescription}>
                        Excel 파일을 업로드하고, 계정명 컬럼을 선택한 후, 세션을 생성하세요.
                    </Typography>
                </Paper>

                {/* 콘텐츠 */}
                <Grid container spacing={2}>
                    {/* 좌측: 파일 업로드 및 목록 (65%) */}
                    <Grid item xs={12} md={8}>
                        <FileUploadSection
                            projectId={projectId}
                            refreshTrigger={refreshTrigger}
                            onRefresh={handleRefresh}
                        />
                    </Grid>

                    {/* 우측: 세션 목록 (35%) */}
                    <Grid item xs={12} md={4}>
                        <SessionListSection
                            projectId={projectId}
                            refreshTrigger={refreshTrigger}
                            onRefresh={handleRefresh}
                        />
                    </Grid>
                </Grid>
            </Box>
        </Container>
    );
}

export default UploadPage;