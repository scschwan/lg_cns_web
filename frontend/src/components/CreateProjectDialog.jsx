import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Box,
    Chip,
    Stack,
    Typography,
    LinearProgress,
    Alert,
    IconButton,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import uploadService from '../services/uploadService';

function CreateProjectDialog({ open, onClose, onCreate }) {
    const [formData, setFormData] = useState({
        name: '',
        description: ''
    });
    const [members, setMembers] = useState([]);
    const [memberEmail, setMemberEmail] = useState('');
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadMessage, setUploadMessage] = useState('');
    const [error, setError] = useState('');

    const handleAddMember = () => {
        const email = memberEmail.trim();
        if (!email) return;

        // 이메일 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError('올바른 이메일 형식이 아닙니다.');
            return;
        }

        // 중복 확인
        if (members.includes(email)) {
            setError('이미 추가된 멤버입니다.');
            return;
        }

        setMembers([...members, email]);
        setMemberEmail('');
        setError('');
    };

    const handleRemoveMember = (email) => {
        setMembers(members.filter(m => m !== email));
    };

    const handleFileSelect = (event) => {
        const selectedFiles = Array.from(event.target.files);

        // Excel 파일만 필터링
        const excelFiles = selectedFiles.filter(file =>
            file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
        );

        if (excelFiles.length !== selectedFiles.length) {
            setError('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.');
        }

        setFiles([...files, ...excelFiles]);
        event.target.value = null; // 같은 파일 재선택 가능하도록
    };

    const handleRemoveFile = (index) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            setError('프로젝트 이름은 필수입니다.');
            return;
        }

        try {
            setUploading(true);
            setError('');
            setUploadProgress(0);
            setUploadMessage('프로젝트 생성 중...');

            // 1. 프로젝트 생성
            const projectData = {
                name: formData.name,
                description: formData.description
            };

            const createdProject = await onCreate(projectData);
            const projectId = createdProject.projectId;

            setUploadProgress(20);
            setUploadMessage('프로젝트 생성 완료');

            // 2. 멤버 초대 (선택사항)
            if (members.length > 0) {
                setUploadMessage(`멤버 초대 중... (${members.length}명)`);

                for (const email of members) {
                    try {
                        // TODO: 멤버 초대 API 호출
                        // await projectService.inviteMember(projectId, email);
                        console.log(`멤버 초대: ${email}`);
                    } catch (err) {
                        console.error(`멤버 초대 실패 (${email}):`, err);
                    }
                }

                setUploadProgress(40);
                setUploadMessage('멤버 초대 완료');
            }

            // 3. 파일 업로드 (선택사항)
            if (files.length > 0) {
                setUploadMessage(`파일 업로드 중... (${files.length}개)`);

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const fileProgress = 40 + ((i + 1) / files.length) * 50;

                    try {
                        await uploadService.uploadFileWithProgress(
                            projectId,
                            file,
                            (progress, message) => {
                                setUploadProgress(
                                    Math.round(fileProgress + (progress * 0.5 / files.length))
                                );
                                setUploadMessage(
                                    `파일 업로드 중... (${i + 1}/${files.length}) ${file.name}`
                                );
                            }
                        );
                    } catch (err) {
                        console.error(`파일 업로드 실패 (${file.name}):`, err);
                        // 개별 파일 실패는 무시하고 계속 진행
                    }
                }

                setUploadProgress(90);
                setUploadMessage('파일 업로드 완료');
            }

            setUploadProgress(100);
            setUploadMessage('모든 작업 완료!');

            // 잠시 대기 후 다이얼로그 닫기
            setTimeout(() => {
                handleClose();
            }, 1000);

        } catch (err) {
            console.error('프로젝트 생성 오류:', err);
            setError(err.message || '프로젝트 생성에 실패했습니다.');
            setUploading(false);
        }
    };

    const handleClose = () => {
        if (uploading) return; // 업로드 중에는 닫기 불가

        setFormData({ name: '', description: '' });
        setMembers([]);
        setMemberEmail('');
        setFiles([]);
        setUploading(false);
        setUploadProgress(0);
        setUploadMessage('');
        setError('');
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            disableEscapeKeyDown={uploading}
        >
            <DialogTitle>새 프로젝트 생성</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    {/* 기본 정보 */}
                    <TextField
                        autoFocus
                        label="프로젝트 이름"
                        fullWidth
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        disabled={uploading}
                    />
                    <TextField
                        label="설명"
                        fullWidth
                        multiline
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        disabled={uploading}
                    />

                    {/* 멤버 초대 (선택사항) */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom>
                            멤버 초대 (선택사항)
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <TextField
                                size="small"
                                label="이메일"
                                fullWidth
                                value={memberEmail}
                                onChange={(e) => setMemberEmail(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddMember();
                                    }
                                }}
                                disabled={uploading}
                                placeholder="member@example.com"
                            />
                            <Button
                                variant="outlined"
                                startIcon={<AddIcon />}
                                onClick={handleAddMember}
                                disabled={uploading}
                            >
                                추가
                            </Button>
                        </Box>
                        {members.length > 0 && (
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                {members.map((email) => (
                                    <Chip
                                        key={email}
                                        label={email}
                                        onDelete={() => handleRemoveMember(email)}
                                        disabled={uploading}
                                    />
                                ))}
                            </Stack>
                        )}
                    </Box>

                    {/* 파일 업로드 (선택사항) */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom>
                            Excel 파일 업로드 (선택사항)
                        </Typography>
                        <Button
                            variant="outlined"
                            component="label"
                            startIcon={<AttachFileIcon />}
                            disabled={uploading}
                            fullWidth
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
                        {files.length > 0 && (
                            <List dense sx={{ mt: 1 }}>
                                {files.map((file, index) => (
                                    <ListItem key={index}>
                                        <ListItemText
                                            primary={file.name}
                                            secondary={`${(file.size / 1024 / 1024).toFixed(2)} MB`}
                                        />
                                        <ListItemSecondaryAction>
                                            <IconButton
                                                edge="end"
                                                onClick={() => handleRemoveFile(index)}
                                                disabled={uploading}
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                ))}
                            </List>
                        )}
                    </Box>

                    {/* 업로드 진행 상태 */}
                    {uploading && (
                        <Box>
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
                        <Alert severity="error" onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={uploading}>
                    취소
                </Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={!formData.name || uploading}
                >
                    {uploading ? '생성 중...' : '생성'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default CreateProjectDialog;