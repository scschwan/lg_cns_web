import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import projectService from '../../services/projectService';

import { useNavigate } from 'react-router-dom';  // ⭐ 추가

import {
    Container,
    Box,
    Typography,
    Button,
    Grid,
    Card,
    CardContent,
    CardActions,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderIcon from '@mui/icons-material/Folder';
import CreateProjectDialog from "../../components/project/CreateProjectDialog";

function ProjectDashboard() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [newProject, setNewProject] = useState({ name: '', description: '' });
    const navigate = useNavigate();  // ⭐ 추가

    const { user } = useAuth();

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

    const handleCreateProject = async () => {
        try {
            await projectService.createProject(newProject);
            setOpenDialog(false);
            setNewProject({ name: '', description: '' });
            loadProjects();
        } catch (err) {
            alert('프로젝트 생성에 실패했습니다.');
            console.error(err);
        }
    };

    return (
        <Container maxWidth="lg">
            <Box sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
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
                    <Alert severity="error" sx={{ mb: 3 }}>
                        {error}
                    </Alert>
                )}

                {loading ? (
                    <Typography>로딩 중...</Typography>
                ) : projects.length === 0 ? (
                    <Box sx={{ textAlign: 'center', mt: 8 }}>
                        <FolderIcon sx={{ fontSize: 80, color: 'text.secondary' }} />
                        <Typography variant="h6" color="text.secondary" sx={{ mt: 2 }}>
                            아직 프로젝트가 없습니다.
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            새 프로젝트를 생성하여 시작하세요.
                        </Typography>
                    </Box>
                ) : (
                    <Grid container spacing={3}>
                        {projects.map((project) => (
                            <Grid item xs={12} sm={6} md={4} key={project.projectId}>  {/* ⭐ id → projectId */}
                                <Card>
                                    <CardContent>
                                        <Typography variant="h6" component="h2" gutterBottom>
                                            {project.name}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {project.description || '설명 없음'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                            생성일: {new Date(project.createdAt).toLocaleDateString()}
                                        </Typography>
                                        {/* ⭐ 추가 정보 표시 */}
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                            세션: {project.completedSessions}/{project.totalSessions}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
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

                                        {/* ⭐ 새 "설정" 버튼 추가 */}
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
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>새 프로젝트 생성</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="프로젝트 이름"
                        fullWidth
                        required
                        value={newProject.name}
                        onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    />
                    <TextField
                        margin="dense"
                        label="설명"
                        fullWidth
                        multiline
                        rows={3}
                        value={newProject.description}
                        onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDialog(false)}>취소</Button>
                    <Button onClick={handleCreateProject} variant="contained" disabled={!newProject.name}>
                        생성
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ⭐ CreateProjectDialog에 onCreate prop 전달 */}
            <CreateProjectDialog
                open={openDialog}
                onClose={() => setOpenDialog(false)}
                onCreate={async (projectData) => {
                    const createdProject = await projectService.createProject(projectData);
                    loadProjects(); // 목록 새로고침
                    return createdProject; // ⭐ 생성된 프로젝트 반환 (파일 업로드에 사용)
                }}
            />
        </Container>
    );
}

export default ProjectDashboard;