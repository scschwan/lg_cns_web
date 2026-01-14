// frontend/src/components/common/Pagination.jsx

import React from 'react';
import { Box, Button, TextField, Select, MenuItem, Typography } from '@mui/material';
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '../../constants/pagination';

/**
 * 페이지네이션 컴포넌트
 * C# WinForms의 페이지네이션 UI 스타일 반영
 * 
 * @param {number} currentPage - 현재 페이지 번호
 * @param {number} totalPages - 전체 페이지 수
 * @param {number} totalRows - 전체 행 수
 * @param {number} pageSize - 페이지 크기
 * @param {function} onPageChange - 페이지 변경 핸들러
 * @param {function} onPageSizeChange - 페이지 크기 변경 핸들러
 */
function Pagination({
    currentPage = 1,
    totalPages = 0,
    totalRows = 0,
    pageSize = DEFAULT_PAGE_SIZE,
    onPageChange,
    onPageSizeChange,
}) {
    const handlePrevPage = () => {
        if (currentPage > 1) {
            onPageChange?.(currentPage - 1);
        }
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            onPageChange?.(currentPage + 1);
        }
    };

    const handlePageInputChange = (e) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 1 && value <= totalPages) {
            onPageChange?.(value);
        }
    };

    const handlePageSizeChange = (e) => {
        onPageSizeChange?.(e.target.value);
    };

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                backgroundColor: '#fff',
                borderTop: '1px solid #ddd',
                gap: 2,
            }}
        >
            {/* 페이지 크기 선택 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                    sx={{
                        fontFamily: 'Pretendard, sans-serif',
                        fontSize: '14px',
                    }}
                >
                    페이지 크기 :
                </Typography>
                <Select
                    value={pageSize}
                    onChange={handlePageSizeChange}
                    size="small"
                    sx={{
                        minWidth: 100,
                        fontFamily: 'Pretendard, sans-serif',
                        fontSize: '14px',
                    }}
                >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                        <MenuItem key={size} value={size}>
                            {size.toLocaleString()}
                        </MenuItem>
                    ))}
                </Select>
            </Box>

            {/* 페이지 네비게이션 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                    variant="outlined"
                    onClick={handlePrevPage}
                    disabled={currentPage <= 1}
                    sx={{
                        fontFamily: 'Pretendard, sans-serif',
                        fontSize: '14px',
                    }}
                >
                    ◀ 이전
                </Button>

                <Typography
                    sx={{
                        fontFamily: 'Pretendard, sans-serif',
                        fontSize: '14px',
                        mx: 1,
                    }}
                >
                    페이지 :
                </Typography>

                <TextField
                    type="number"
                    value={currentPage}
                    onChange={handlePageInputChange}
                    size="small"
                    inputProps={{
                        min: 1,
                        max: totalPages,
                        style: {
                            width: '50px',
                            textAlign: 'center',
                            fontFamily: 'Pretendard, sans-serif',
                        },
                    }}
                />

                <Typography
                    sx={{
                        fontFamily: 'Pretendard, sans-serif',
                        fontSize: '14px',
                        mx: 1,
                    }}
                >
                    / {totalPages} (총 {totalRows.toLocaleString()} 행)
                </Typography>

                <Button
                    variant="outlined"
                    onClick={handleNextPage}
                    disabled={currentPage >= totalPages}
                    sx={{
                        fontFamily: 'Pretendard, sans-serif',
                        fontSize: '14px',
                    }}
                >
                    다음 ▶
                </Button>
            </Box>
        </Box>
    );
}

export default Pagination;
