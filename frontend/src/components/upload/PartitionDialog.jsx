// frontend/src/components/upload/PartitionDialog.jsx

import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TextField,
    Checkbox,
    Typography,
    Alert
} from '@mui/material';
import styles from './PartitionDialog.module.css';

function PartitionDialog({ open, partitions, onClose, onApprove }) {
    const [editedPartitions, setEditedPartitions] = useState([]);
    const [selectedPartitions, setSelectedPartitions] = useState([]);

    React.useEffect(() => {
        if (open && partitions) {
            setEditedPartitions(partitions.map(p => ({ ...p, selected: true })));
            setSelectedPartitions(partitions.map((_, index) => index));
        }
    }, [open, partitions]);

    const handleTogglePartition = (index) => {
        setSelectedPartitions(prev =>
            prev.includes(index)
                ? prev.filter(i => i !== index)
                : [...prev, index]
        );
    };

    const handleFieldChange = (index, field, value) => {
        setEditedPartitions(prev => prev.map((p, i) =>
            i === index ? { ...p, [field]: value } : p
        ));
    };

    const handleApprove = () => {
        const approved = editedPartitions.filter((_, index) => selectedPartitions.includes(index));
        onApprove(approved);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle className={styles.dialogTitle}>
                파티션 분석 결과
            </DialogTitle>
            <DialogContent>
                <Alert severity="info" className={styles.infoAlert}>
                    계정명별로 파일이 자동 그룹핑되었습니다. 세션명과 작업자명을 확인하고 승인해주세요.
                </Alert>

                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    checked={selectedPartitions.length === editedPartitions.length}
                                    indeterminate={selectedPartitions.length > 0 && selectedPartitions.length < editedPartitions.length}
                                    onChange={() => {
                                        if (selectedPartitions.length === editedPartitions.length) {
                                            setSelectedPartitions([]);
                                        } else {
                                            setSelectedPartitions(editedPartitions.map((_, i) => i));
                                        }
                                    }}
                                />
                            </TableCell>
                            <TableCell>계정명</TableCell>
                            <TableCell>세션명</TableCell>
                            <TableCell>작업자명</TableCell>
                            <TableCell align="center">파일 수</TableCell>
                            <TableCell align="center">행 수</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {editedPartitions.map((partition, index) => (
                            <TableRow key={index} selected={selectedPartitions.includes(index)}>
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        checked={selectedPartitions.includes(index)}
                                        onChange={() => handleTogglePartition(index)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" className={styles.accountName}>
                                        {partition.accountName}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        fullWidth
                                        value={partition.sessionName}
                                        onChange={(e) => handleFieldChange(index, 'sessionName', e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        fullWidth
                                        value={partition.workerName || ''}
                                        onChange={(e) => handleFieldChange(index, 'workerName', e.target.value)}
                                        placeholder="작업자명 (선택)"
                                    />
                                </TableCell>
                                <TableCell align="center">{partition.fileCount}</TableCell>
                                <TableCell align="center">{partition.totalRows?.toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>취소</Button>
                <Button
                    variant="contained"
                    onClick={handleApprove}
                    disabled={selectedPartitions.length === 0}
                    className={styles.approveButton}
                >
                    {selectedPartitions.length}개 세션 생성
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default PartitionDialog;