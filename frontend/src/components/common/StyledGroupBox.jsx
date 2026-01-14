// frontend/src/components/common/StyledGroupBox.jsx

import React from 'react';
import { Paper, Typography, Box } from '@mui/material';

/**
 * C# WinForms GroupBox 스타일을 반영한 MUI Paper 래퍼
 * 
 * @param {string} title - 그룹박스 제목
 * @param {React.ReactNode} children - 내부 콘텐츠
 * @param {string} warningText - 경고/안내 텍스트 (선택)
 * @param {string} warningText2 - 두 번째 경고/안내 텍스트 (선택)
 * @param {object} sx - 추가 스타일
 */
function StyledGroupBox({ 
    title, 
    children, 
    warningText, 
    warningText2,
    sx = {} 
}) {
    return (
        <Paper
            variant="outlined"
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                ...sx,
            }}
        >
            {/* 제목 */}
            <Typography
                variant="subtitle1"
                sx={{
                    fontFamily: 'Pretendard, sans-serif',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid #ddd',
                    backgroundColor: '#fafafa',
                }}
            >
                {title}
            </Typography>

            {/* 경고/안내 텍스트 */}
            {(warningText || warningText2) && (
                <Box sx={{ padding: '0.5rem 1rem', backgroundColor: '#fff' }}>
                    {warningText && (
                        <Typography
                            sx={{
                                fontFamily: 'Pretendard, sans-serif',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                color: '#CD5C5C', // IndianRed
                            }}
                        >
                            ※ {warningText}
                        </Typography>
                    )}
                    {warningText2 && (
                        <Typography
                            sx={{
                                fontFamily: 'Pretendard, sans-serif',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                color: '#CD5C5C',
                                mt: 0.5,
                            }}
                        >
                            ※ {warningText2}
                        </Typography>
                    )}
                </Box>
            )}

            {/* 콘텐츠 */}
            <Box
                sx={{
                    flex: 1,
                    padding: '1rem',
                    overflow: 'auto',
                }}
            >
                {children}
            </Box>
        </Paper>
    );
}

export default StyledGroupBox;
