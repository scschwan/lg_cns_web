// frontend/src/components/SessionPartitionDialog.jsx

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

function SessionPartitionDialog({ open, partitions, onClose, onApprove }) {
    const [editedPartitions, setEditedPartitions] = useState([]);

    useEffect(() => {
        if (partitions) {
            setEditedPartitions(partitions.map((p, idx) => ({
                ...p,
                id: idx
            })));
        }
    }, [partitions]);

    const columns = [
        {
            field: 'accountName',
            headerName: '계정명',
            width: 150,
            editable: false
        },
        {
            field: 'sessionName',
            headerName: '세션명 (편집가능)',
            flex: 1,
            minWidth: 300,
            editable: true
        },
        {
            field: 'fileCount',
            headerName: '파일 수',
            width: 100,
            editable: false
        },
        {
            field: 'totalRows',
            headerName: '총 행수',
            width: 120,
            editable: false,
            valueFormatter: (params) => params.value?.toLocaleString() || '0'
        },
        {
            field: 'totalAmount',
            headerName: '합산 금액',
            width: 150,
            editable: false,
            valueFormatter: (params) =>
                params.value ? `${params.value.toLocaleString()} 원` : '0 원'
        }
    ];

    const handleProcessRowUpdate = (newRow) => {
        setEditedPartitions(prev =>
            prev.map(p => p.id === newRow.id ? newRow : p)
        );
        return newRow;
    };

    const handleApprove = () => {
        onApprove(editedPartitions);
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>
                <Typography variant="h6" fontWeight="bold">
                    세션 생성 미리보기
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    계정명별로 분리된 세션들입니다. 세션명을 클릭하여 편집할 수 있습니다.
                </Typography>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ height: 400, mt: 2 }}>
                    <DataGrid
                        rows={editedPartitions}
                        columns={columns}
                        processRowUpdate={handleProcessRowUpdate}
                        disableRowSelectionOnClick
                        hideFooter
                        sx={{
                            '& .MuiDataGrid-columnHeaders': {
                                bgcolor: 'lightsteelblue',
                                fontWeight: 'bold'
                            },
                            '& .MuiDataGrid-row:nth-of-type(even)': {
                                bgcolor: 'aliceblue'
                            }
                        }}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="inherit">
                    취소
                </Button>
                <Button
                    onClick={handleApprove}
                    variant="contained"
                    color="primary"
                >
                    세션 생성
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default SessionPartitionDialog;