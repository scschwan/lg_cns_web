// frontend/src/pages/project/ProjectDashboard.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import projectService from '../../services/projectService';
import {
    Container,
    Box,
    Typography,
    Button,
    Grid,
    Card,
    CardContent,
    CardActions,
    Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderIcon from '@mui/icons-material/Folder';
import CreateProjectDialog from '../../components/project/CreateProjectDialog';
import styles from './ProjectDashboard.module.css';

function ProjectDashboard() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [openDialog, setOpenDialog] = useState(false);

    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            setLoading(true);
            const data = await projectService.getMyProjects();
            setProjects(data);
        } catch (err) {
            setError('프로젝트 목록을 불러오는데 실패했습니다.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="lg">
            <Box className={styles.contentWrapper}>
                <Box className={styles.header}>
                    <Typography variant="h4" component="h1">
                        내 프로젝트
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenDialog(true)}
                    >
                        새 프로젝트
                    </Button>
                </Box>

                {error && (
                    <Alert severity="error" className={styles.errorAlert}>
                        {error}
                    </Alert>
                )}

                {loading ? (
                    <Typography>로딩 중...</Typography>
                ) : projects.length === 0 ? (
                    <Box className={styles.emptyState}>
                        <FolderIcon className={styles.emptyIcon} />
                        <Typography variant="h6" className={styles.emptyTitle}>
                            아직 프로젝트가 없습니다.
                        </Typography>
                        <Typography variant="body2" className={styles.emptyDescription}>
                            새 프로젝트를 생성하여 시작하세요.
                        </Typography>
                    </Box>
                ) : (
                    <Grid container spacing={3}>
                        {projects.map((project) => (
                            <Grid item xs={12} sm={6} md={4} key={project.projectId}>
                                <Card>
                                    <CardContent>
                                        <Typography variant="h6" component="h2" gutterBottom>
                                            {project.name}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {project.description || '설명 없음'}
                                        </Typography>
                                        <Typography variant="caption" className={styles.projectInfo}>
                                            생성일: {new Date(project.createdAt).toLocaleDateString()}
                                        </Typography>
                                        <Typography variant="caption" className={styles.projectInfo}>
                                            세션: {project.completedSessions}/{project.totalSessions}
                                        </Typography>
                                        <Typography variant="caption" className={styles.projectInfo}>
                                            멤버: {project.memberCount}명
                                        </Typography>
                                    </CardContent>
                                    <CardActions>
                                        <Button
                                            size="small"
                                            color="primary"
                                            onClick={() => navigate(`/projects/${project.projectId}/upload`)}
                                        >
                                            열기
                                        </Button>
                                        <Button
                                            size="small"
                                            onClick={() => navigate(`/projects/${project.projectId}/settings`)}
                                        >
                                            설정
                                        </Button>
                                    </CardActions>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                )}
            </Box>

            {/* 프로젝트 생성 다이얼로그 */}
            <CreateProjectDialog
                open={openDialog}
                onClose={() => setOpenDialog(false)}
                onCreate={async (projectData) => {
                    const createdProject = await projectService.createProject(projectData);
                    loadProjects();
                    return createdProject;
                }}
            />
        </Container>
    );
}

export default ProjectDashboard;