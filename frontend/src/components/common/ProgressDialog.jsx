// frontend/src/components/common/ProgressDialog.jsx

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    Box,
    LinearProgress,
    Typography
} from '@mui/material';

function ProgressDialog({ open, message, value }) {
    return (
        <Dialog
            open={open}
            disableEscapeKeyDown
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle>
                처리 중...
            </DialogTitle>
            <DialogContent>
                <Box sx={{ width: '100%', mt: 2 }}>
                    <LinearProgress
                        variant={value !== undefined ? "determinate" : "indeterminate"}
                        value={value || 0}
                    />
                    {/* ⭐ Typography를 Box 밖으로 이동 */}
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        align="center"
                        sx={{ mt: 2 }}
                    >
                        {message}
                    </Typography>
                </Box>
            </DialogContent>
        </Dialog>
    );
}

export default ProgressDialog;