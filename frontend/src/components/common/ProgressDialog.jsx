// frontend/src/components/ProgressDialog.jsx

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Typography,
    Box
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
                <Typography variant="h6" align="center">
                    처리 중...
                </Typography>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ py: 2 }}>
                    <LinearProgress
                        variant="determinate"
                        value={value}
                        sx={{ height: 10, borderRadius: 5 }}
                    />
                    <Typography
                        variant="body1"
                        align="center"
                        sx={{ mt: 2 }}
                    >
                        {message}
                    </Typography>
                    <Typography
                        variant="h6"
                        align="center"
                        color="primary"
                        sx={{ mt: 1 }}
                    >
                        {Math.round(value)}%
                    </Typography>
                </Box>
            </DialogContent>
        </Dialog>
    );
}

export default ProgressDialog;