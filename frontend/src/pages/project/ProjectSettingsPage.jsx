// frontend/src/pages/ProjectSettingsPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    Typography,
    Paper,
    TextField,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import projectService from '../../services/projectService';

function ProjectSettingsPage() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [openInvite, setOpenInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        loadProject();
    }, [projectId]);

    const loadProject = async () => {
        const data = await projectService.getProject(projectId);
        setProject(data);
        setFormData({ name: data.projectName, description: data.description });
    };

    const handleUpdate = async () => {
        try {
            await projectService.updateProject(projectId, formData);
            alert('프로젝트가 수정되었습니다.');
            loadProject();
        } catch (err) {
            setError('프로젝트 수정에 실패했습니다.');
        }
    };

    const handleInvite = async () => {
        try {
            await projectService.inviteMember(projectId, {
                email: inviteEmail,
                role: 'VIEWER'
            });
            alert('멤버가 초대되었습니다.');
            setOpenInvite(false);
            setInviteEmail('');
            loadProject();
        } catch (err) {
            setError('멤버 초대에 실패했습니다.');
        }
    };

    const handleRemoveMember = async (userId) => {
        if (window.confirm('정말 이 멤버를 삭제하시겠습니까?')) {
            try {
                await projectService.removeMember(projectId, userId);
                alert('멤버가 삭제되었습니다.');
                loadProject();
            } catch (err) {
                setError('멤버 삭제에 실패했습니다.');
            }
        }
    };

    const handleDeleteProject = async () => {
        if (window.confirm('정말 이 프로젝트를 삭제하시겠습니까?')) {
            try {
                await projectService.deleteProject(projectId);
                alert('프로젝트가 삭제되었습니다.');
                navigate('/projects');
            } catch (err) {
                setError('프로젝트 삭제에 실패했습니다.');
            }
        }
    };

    if (!project) return null;

    return (
        <Container maxWidth="md">
            <Box sx={{ mt: 4, mb: 4 }}>
                <Typography variant="h4" gutterBottom>
                    프로젝트 설정
                </Typography>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* 프로젝트 정보 */}
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" gutterBottom>
                        프로젝트 정보
                    </Typography>
                    <TextField
                        label="프로젝트 이름"
                        fullWidth
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        label="설명"
                        fullWidth
                        multiline
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        sx={{ mb: 2 }}
                    />
                    <Button variant="contained" onClick={handleUpdate}>
                        저장
                    </Button>
                </Paper>

                {/* 멤버 관리 */}
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">
                            멤버 관리
                        </Typography>
                        <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={() => setOpenInvite(true)}
                        >
                            멤버 초대
                        </Button>
                    </Box>
                    <List>
                        {project.members?.map((member) => (
                            <ListItem key={member.userId}>
                                <ListItemText
                                    primary={member.userId}
                                    secondary={member.joinedAt}
                                />
                                <Chip label={member.role} size="small" sx={{ mr: 1 }} />
                                {member.role !== 'OWNER' && (
                                    <ListItemSecondaryAction>
                                        <IconButton
                                            edge="end"
                                            onClick={() => handleRemoveMember(member.userId)}
                                        >
                                            <DeleteIcon />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                )}
                            </ListItem>
                        ))}
                    </List>
                </Paper>

                {/* 프로젝트 삭제 */}
                <Paper sx={{ p: 3, bgcolor: 'error.light' }}>
                    <Typography variant="h6" gutterBottom>
                        위험 구역
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                        프로젝트를 삭제하면 복구할 수 없습니다.
                    </Typography>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleDeleteProject}
                    >
                        프로젝트 삭제
                    </Button>
                </Paper>

                {/* 멤버 초대 다이얼로그 */}
                <Dialog open={openInvite} onClose={() => setOpenInvite(false)}>
                    <DialogTitle>멤버 초대</DialogTitle>
                    <DialogContent>
                        <TextField
                            autoFocus
                            label="이메일"
                            fullWidth
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            sx={{ mt: 1 }}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenInvite(false)}>취소</Button>
                        <Button onClick={handleInvite} variant="contained">초대</Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </Container>
    );
}

export default ProjectSettingsPage;