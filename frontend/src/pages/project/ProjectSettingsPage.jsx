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
    Chip,
    Tabs,
    Tab,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Select,
    MenuItem,
    FormControl,
    InputLabel
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DescriptionIcon from '@mui/icons-material/Description';
import PeopleIcon from '@mui/icons-material/People';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

import projectService from '../../services/projectService';
import styles from './ProjectSettingsPage.module.css';

const ProjectSettingsPage = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [projectName, setProjectName] = useState('');
    const [projectDescription, setProjectDescription] = useState('');
    const [files, setFiles] = useState([]);
    const [filesLoading, setFilesLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');

    const [currentTab, setCurrentTab] = useState(0);
    const [members, setMembers] = useState([]);
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('VIEWER');

    useEffect(() => {
        loadProjectData();
    }, [projectId]);

    const loadProjectData = async () => {
        try {
            setLoading(true);
            setError(null);

            const projectData = await projectService.getProject(projectId);
            setProject(projectData);
            setProjectName(projectData.projectName);
            setProjectDescription(projectData.description || '');

            await loadProjectFiles();
            await loadProjectMembers();

        } catch (err) {
            console.error('프로젝트 정보 로드 실패:', err);
            setError('프로젝트 정보를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const loadProjectFiles = async () => {
        try {
            setFilesLoading(true);
            const filesData = await projectService.getProjectFiles(projectId);

            const formattedFiles = filesData.map((file, index) => ({
                id: file.fileId || index,
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
        } finally {
            setFilesLoading(false);
        }
    };

    const loadProjectMembers = async () => {
        try {
            const membersData = await projectService.getProjectMembers(projectId);

            const formattedMembers = membersData.map(member => ({
                id: member.userId,
                email: member.email || '-',
                name: member.name || '-',
                role: member.role,
                joinedAt: member.joinedAt,
                isOwner: member.role === 'OWNER'
            }));

            setMembers(formattedMembers);
        } catch (err) {
            console.error('멤버 목록 로드 실패:', err);
            setMembers([]);
        }
    };

    const handleInviteMember = async () => {
        if (!inviteEmail.trim()) {
            alert('이메일을 입력해주세요.');
            return;
        }

        try {
            await projectService.inviteMember(projectId, inviteEmail, inviteRole);
            setInviteDialogOpen(false);
            setInviteEmail('');
            setInviteRole('VIEWER');
            await loadProjectMembers();
            setSuccessMessage('멤버 초대가 완료되었습니다.');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
            console.error('멤버 초대 실패:', err);
            setError('멤버 초대에 실패했습니다.');
        }
    };

    const handleDeleteMember = async (memberId) => {
        if (!window.confirm('정말로 이 멤버를 삭제하시겠습니까?')) return;

        try {
            await projectService.removeMember(projectId, memberId);
            await loadProjectMembers();
            setSuccessMessage('멤버가 삭제되었습니다.');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
            console.error('멤버 삭제 실패:', err);
            setError('멤버 삭제에 실패했습니다.');
        }
    };

    const handleRoleChange = async (memberId, newRole) => {
        try {
            await projectService.updateMemberRole(projectId, memberId, newRole);
            await loadProjectMembers();
            setSuccessMessage('역할이 변경되었습니다.');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
            console.error('역할 변경 실패:', err);
            setError('역할 변경에 실패했습니다.');
        }
    };

    const handleDeleteProject = async () => {
        if (!window.confirm(
            '프로젝트를 삭제하시겠습니까?\n\n' +
            '⚠️ 경고:\n' +
            '- 프로젝트에 포함된 모든 파일이 삭제됩니다.\n' +
            '- 이 작업은 되돌릴 수 없습니다.\n\n' +
            '계속하시겠습니까?'
        )) return;

        try {
            await projectService.deleteProject(projectId);
            alert('프로젝트가 삭제되었습니다.');
            navigate('/projects');
        } catch (err) {
            console.error('프로젝트 삭제 실패:', err);
            setError('프로젝트 삭제에 실패했습니다.');
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

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
            setTimeout(() => setSuccessMessage(''), 3000);

        } catch (err) {
            console.error('프로젝트 저장 실패:', err);
            setError('프로젝트 정보 저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const fileColumns = [
        { field: 'fileName', headerName: '파일명', flex: 2, minWidth: 200 },
        { field: 'fileSize', headerName: '크기', width: 100, align: 'right' },
        { field: 'columnCount', headerName: '컬럼 수', width: 100, align: 'center' },
        { field: 'accountColumn', headerName: '계정명 컬럼', flex: 1, minWidth: 150 },
        { field: 'amountColumn', headerName: '금액 컬럼', flex: 1, minWidth: 150 },
        { field: 'uploadedAt', headerName: '업로드 시간', flex: 1, minWidth: 150 }
    ];

    const memberColumns = [
        { field: 'email', headerName: '이메일', flex: 1, minWidth: 200 },
        { field: 'name', headerName: '이름', width: 150 },
        {
            field: 'role',
            headerName: '역할',
            width: 150,
            renderCell: (params) => (
                <Select
                    value={params.value}
                    onChange={(e) => handleRoleChange(params.row.id, e.target.value)}
                    size="small"
                    disabled={params.row.isOwner}
                >
                    <MenuItem value="OWNER">소유자</MenuItem>
                    <MenuItem value="EDITOR">편집자</MenuItem>
                    <MenuItem value="VIEWER">뷰어</MenuItem>
                </Select>
            )
        },
        {
            field: 'joinedAt',
            headerName: '참여일',
            width: 150,
            valueFormatter: (params) => formatDate(params.value)
        },
        {
            field: 'actions',
            headerName: '삭제',
            width: 80,
            renderCell: (params) => (
                <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteMember(params.row.id)}
                    disabled={params.row.isOwner}
                >
                    <DeleteIcon fontSize="small" />
                </IconButton>
            )
        }
    ];

    if (loading) {
        return (
            <Box className={styles.loadingContainer}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box className={styles.contentWrapper}>
            {/* 헤더 */}
            <Box className={styles.headerBox}>
                <Button
                    className={styles.backButton}
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/projects')}
                >
                    프로젝트 목록
                </Button>
                <Typography variant="h5" style={{ fontWeight: 600 }}>
                    프로젝트 설정
                </Typography>
            </Box>

            {/* 에러/성공 메시지 */}
            {error && (
                <Alert severity="error" className={styles.errorAlert} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}
            {successMessage && (
                <Alert severity="success" className={styles.errorAlert} onClose={() => setSuccessMessage('')}>
                    {successMessage}
                </Alert>
            )}

            {/* 탭 */}
            <Paper className={styles.tabsWrapper}>
                <Tabs value={currentTab} onChange={(e, val) => setCurrentTab(val)}>
                    <Tab label="기본 정보" />
                    <Tab label="업로드된 파일" icon={<DescriptionIcon />} iconPosition="start" />
                    <Tab label="프로젝트 멤버" icon={<PeopleIcon />} iconPosition="start" />
                </Tabs>
            </Paper>

            {/* 탭 0: 기본 정보 */}
            {currentTab === 0 && (
                <Paper className={styles.tabContent}>
                    <Typography variant="h6" className={styles.tabHeaderTitle}>
                        기본 정보
                    </Typography>
                    <TextField
                        fullWidth
                        label="프로젝트 이름"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        className={styles.textField}
                        required
                    />
                    <TextField
                        fullWidth
                        label="프로젝트 설명"
                        value={projectDescription}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        multiline
                        rows={3}
                        className={styles.textField}
                    />
                    <Box className={styles.buttonGroup}>
                        <Button
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteIcon />}
                            onClick={handleDeleteProject}
                        >
                            프로젝트 삭제
                        </Button>
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
            )}

            {/* 탭 1: 업로드된 파일 */}
            {currentTab === 1 && (
                <Paper className={styles.tabContent}>
                    <Box className={styles.tabHeader}>
                        <DescriptionIcon className={styles.tabHeaderIcon} />
                        <Typography variant="h6" className={styles.tabHeaderTitle}>
                            업로드된 파일
                        </Typography>
                        <Chip label={`${files.length}개`} size="small" className={styles.tabHeaderChip} color="primary" />
                    </Box>
                    <Divider className={styles.divider} />
                    {filesLoading ? (
                        <Box className={styles.fileLoadingContainer}>
                            <CircularProgress />
                        </Box>
                    ) : files.length === 0 ? (
                        <Box className={styles.emptyState}>
                            <DescriptionIcon className={styles.emptyStateIcon} />
                            <Typography>업로드된 파일이 없습니다.</Typography>
                        </Box>
                    ) : (
                        <DataGrid
                            rows={files}
                            columns={fileColumns}
                            pageSize={10}
                            rowsPerPageOptions={[10, 25, 50]}
                            autoHeight
                            disableSelectionOnClick
                            className={styles.dataGrid}
                        />
                    )}
                </Paper>
            )}

            {/* 탭 2: 프로젝트 멤버 */}
            {currentTab === 2 && (
                <Paper className={styles.tabContent}>
                    <Box className={styles.sectionHeader}>
                        <Box className={styles.tabHeader}>
                            <PeopleIcon className={styles.tabHeaderIcon} />
                            <Typography variant="h6" className={styles.tabHeaderTitle}>
                                프로젝트 멤버
                            </Typography>
                            <Chip label={`${members.length}명`} size="small" className={styles.tabHeaderChip} color="primary" />
                        </Box>
                        <Button
                            variant="contained"
                            startIcon={<PersonAddIcon />}
                            onClick={() => setInviteDialogOpen(true)}
                            className={styles.inviteButton}
                        >
                            멤버 초대
                        </Button>
                    </Box>
                    <Divider className={styles.divider} />
                    <DataGrid
                        rows={members}
                        columns={memberColumns}
                        pageSize={10}
                        rowsPerPageOptions={[10, 25, 50]}
                        autoHeight
                        disableSelectionOnClick
                        className={styles.dataGrid}
                    />
                </Paper>
            )}

            {/* 멤버 초대 다이얼로그 */}
            <Dialog open={inviteDialogOpen} onClose={() => setInviteDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>멤버 초대</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="이메일"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className={styles.dialogTextField}
                        placeholder="user@example.com"
                    />
                    <FormControl fullWidth className={styles.dialogTextField}>
                        <InputLabel>역할</InputLabel>
                        <Select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            label="역할"
                        >
                            <MenuItem value="EDITOR">편집자</MenuItem>
                            <MenuItem value="VIEWER">뷰어</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setInviteDialogOpen(false)}>취소</Button>
                    <Button variant="contained" onClick={handleInviteMember}>초대</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ProjectSettingsPage;