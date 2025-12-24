// frontend/src/components/upload/SessionListSection.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Paper,
    Box,
    Typography,
    Button,
    Alert,
    Chip,
    IconButton,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Checkbox,
    TableContainer,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions
} from '@mui/material';
import MergeIcon from '@mui/icons-material/MergeType';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';

import multiFileUploadService from '../../services/multiFileUploadService';
import styles from './SessionListSection.module.css';

function SessionListSection({ projectId, refreshTrigger, onRefresh }) {
    const navigate = useNavigate();

    const [sessions, setSessions] = useState([]);
    const [selectedSessionIds, setSelectedSessionIds] = useState([]);
    const [error, setError] = useState(null);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingSession, setEditingSession] = useState(null);
    const [editValues, setEditValues] = useState({ sessionName: '', workerName: '' });

    useEffect(() => {
        loadSessions();
    }, [projectId, refreshTrigger]);

    const loadSessions = async () => {
        try {
            const data = await multiFileUploadService.getSessions(projectId);
            setSessions(data);
        } catch (error) {
            console.error('세션 목록 로드 실패:', error);
            setError('세션 목록을 불러올 수 없습니다.');
        }
    };

    // 세션 선택 토글
    const handleSelectSession = (sessionId) => {
        setSelectedSessionIds(prev =>
            prev.includes(sessionId)
                ? prev.filter(id => id !== sessionId)
                : [...prev, sessionId]
        );
    };

    // 세션 시작 (Step 2 진입)
    const handleStartSession = async () => {
        if (selectedSessionIds.length !== 1) {
            setError('시작할 세션을 1개만 선택해주세요.');
            return;
        }

        const confirmed = window.confirm(
            '세션을 시작하시겠습니까?\n\n' +
            '• Step 2: File Load로 이동합니다.\n' +
            '• Lambda가 Excel 파일을 파싱하여 raw_data에 저장합니다.'
        );

        if (!confirmed) return;

        try {
            const sessionId = selectedSessionIds[0];
            await multiFileUploadService.startSession(projectId, sessionId);

            alert('세션이 시작되었습니다. Step 2: File Load로 이동합니다.');

        } catch (error) {
            console.error('세션 시작 실패:', error);
            setError('세션 시작에 실패했습니다.');
        }
    };

    // 세션 병합
    const handleMerge = async () => {
        if (selectedSessionIds.length < 2) {
            setError('병합할 세션을 2개 이상 선택해주세요.');
            return;
        }

        const newSessionName = prompt('병합된 세션의 이름을 입력하세요:');
        if (!newSessionName) return;

        const workerName = prompt('작업자명을 입력하세요 (선택):') || '';

        try {
            await multiFileUploadService.mergeSessions(
                projectId,
                selectedSessionIds,
                newSessionName,
                workerName
            );

            setSelectedSessionIds([]);
            loadSessions();
            onRefresh();
            alert('세션이 병합되었습니다.');

        } catch (error) {
            console.error('세션 병합 실패:', error);
            setError('세션 병합에 실패했습니다.');
        }
    };

    // 세션 삭제
    const handleDelete = async () => {
        if (selectedSessionIds.length === 0) {
            setError('삭제할 세션을 선택해주세요.');
            return;
        }

        const confirmed = window.confirm(
            `선택된 ${selectedSessionIds.length}개의 세션을 삭제하시겠습니까?`
        );

        if (!confirmed) return;

        try {
            for (const sessionId of selectedSessionIds) {
                await multiFileUploadService.deleteSession(projectId, sessionId);
            }

            setSelectedSessionIds([]);
            loadSessions();
            onRefresh();
            alert('세션이 삭제되었습니다.');

        } catch (error) {
            console.error('세션 삭제 실패:', error);
            setError('세션 삭제에 실패했습니다.');
        }
    };

    // 세션 수정 다이얼로그 열기
    const handleEdit = (session) => {
        setEditingSession(session);
        setEditValues({
            sessionName: session.sessionName,
            workerName: session.workerName || ''
        });
        setEditDialogOpen(true);
    };

    // 세션 수정 저장
    const handleSaveEdit = async () => {
        try {
            await multiFileUploadService.updateSession(
                projectId,
                editingSession.sessionId,
                editValues.sessionName,
                editValues.workerName
            );

            setEditDialogOpen(false);
            loadSessions();
            alert('세션이 수정되었습니다.');

        } catch (error) {
            console.error('세션 수정 실패:', error);
            setError('세션 수정에 실패했습니다.');
        }
    };

    return (
        <Paper className={styles.paper}>
            {/* 헤더 */}
            <Box className={styles.header}>
                <Typography variant="h6" className={styles.headerTitle}>
                    세션 목록
                </Typography>
            </Box>

            {/* 버튼 영역 */}
            <Box className={styles.buttonArea}>
                <Button
                    variant="contained"
                    startIcon={<PlayArrowIcon />}
                    onClick={handleStartSession}
                    disabled={selectedSessionIds.length !== 1}
                    className={styles.startButton}
                    size="small"
                >
                    시작
                </Button>
                <Button
                    variant="contained"
                    startIcon={<MergeIcon />}
                    onClick={handleMerge}
                    disabled={selectedSessionIds.length < 2}
                    className={styles.mergeButton}
                    size="small"
                >
                    병합
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={handleDelete}
                    disabled={selectedSessionIds.length === 0}
                    size="small"
                >
                    삭제
                </Button>
            </Box>

            {/* 에러 표시 */}
            {error && (
                <Alert severity="error" className={styles.errorAlert} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* 세션 테이블 */}
            <TableContainer className={styles.tableContainer}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    checked={sessions.length > 0 && selectedSessionIds.length === sessions.length}
                                    indeterminate={selectedSessionIds.length > 0 && selectedSessionIds.length < sessions.length}
                                    onChange={() => {
                                        if (selectedSessionIds.length === sessions.length) {
                                            setSelectedSessionIds([]);
                                        } else {
                                            setSelectedSessionIds(sessions.map(s => s.sessionId));
                                        }
                                    }}
                                />
                            </TableCell>
                            <TableCell>세션명</TableCell>
                            <TableCell align="center" width={80}>파일</TableCell>
                            <TableCell align="center" width={80}>행 수</TableCell>
                            <TableCell align="center" width={60}>수정</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sessions.map((session) => (
                            <TableRow
                                key={session.sessionId}
                                selected={selectedSessionIds.includes(session.sessionId)}
                                className={styles.tableRow}
                            >
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        checked={selectedSessionIds.includes(session.sessionId)}
                                        onChange={() => handleSelectSession(session.sessionId)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" className={styles.sessionName}>
                                        {session.sessionName}
                                    </Typography>
                                    {session.workerName && (
                                        <Typography variant="caption" className={styles.workerName}>
                                            작업자: {session.workerName}
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell align="center">
                                    <Chip label={session.totalFiles} size="small" />
                                </TableCell>
                                <TableCell align="center">
                                    {session.totalRowCount?.toLocaleString() || 0}
                                </TableCell>
                                <TableCell align="center">
                                    <IconButton
                                        size="small"
                                        onClick={() => handleEdit(session)}
                                    >
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {sessions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} align="center" className={styles.emptyCell}>
                                    <Typography variant="body2" color="text.secondary">
                                        생성된 세션이 없습니다.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* 세션 수정 다이얼로그 */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>세션 수정</DialogTitle>
                <DialogContent>
                    <TextField
                        label="세션명"
                        fullWidth
                        margin="normal"
                        value={editValues.sessionName}
                        onChange={(e) => setEditValues({ ...editValues, sessionName: e.target.value })}
                    />
                    <TextField
                        label="작업자명"
                        fullWidth
                        margin="normal"
                        value={editValues.workerName}
                        onChange={(e) => setEditValues({ ...editValues, workerName: e.target.value })}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialogOpen(false)}>취소</Button>
                    <Button onClick={handleSaveEdit} variant="contained">저장</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}

export default SessionListSection;