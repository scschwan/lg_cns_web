// frontend/src/components/common/SessionHeader.jsx

import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * 세션명 표시 헤더 컴포넌트
 * C# WinForms의 current_sessionName 라벨 스타일 반영
 */
function SessionHeader({ sessionName }) {
    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                padding: '0.5rem 1rem',
                minHeight: '40px',
            }}
        >
            <Typography
                variant="h6"
                sx={{
                    fontFamily: 'Pretendard, sans-serif',
                    fontWeight: 'bold',
                    fontSize: '18px',
                    color: '#333',
                }}
            >
                현재 세션명 : {sessionName || '-'}
            </Typography>
        </Box>
    );
}

export default SessionHeader;
