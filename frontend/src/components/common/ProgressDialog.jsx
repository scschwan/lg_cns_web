// frontend/src/components/common/ProgressDialog.jsx

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Typography,
    Box
} from '@mui/material';
import styles from './ProgressDialog.module.css';

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
                <Box className={styles.contentBox}>
                    <LinearProgress
                        variant="determinate"
                        value={value}
                        className={styles.progressBar}
                    />
                    <Typography
                        variant="body1"
                        align="center"
                        className={styles.message}
                    >
                        {message}
                    </Typography>
                    <Typography
                        variant="h6"
                        align="center"
                        color="primary"
                        className={styles.percentage}
                    >
                        {Math.round(value)}%
                    </Typography>
                </Box>
            </DialogContent>
        </Dialog>
    );
}

export default ProgressDialog;