// frontend/src/components/common/StyledDataGrid.jsx

import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography } from '@mui/material';
import { COLORS } from '../../constants/colors';

/**
 * C# WinForms DataGridView 스타일을 반영한 MUI DataGrid 래퍼
 * 
 * @param {string} title - 테이블 제목 (선택)
 * @param {array} rows - 데이터 행
 * @param {array} columns - 컬럼 정의
 * @param {boolean} checkboxSelection - 체크박스 선택 여부
 * @param {function} onSelectionChange - 선택 변경 핸들러
 * @param {array} selectionModel - 선택된 행 ID 배열
 * @param {string} height - 테이블 높이 (기본: 400px)
 * @param {object} sx - 추가 스타일
 */
function StyledDataGrid({
    title,
    rows = [],
    columns = [],
    checkboxSelection = false,
    onSelectionChange,
    selectionModel = [],
    height = '400px',
    getRowId,
    sx = {},
    ...props
}) {
    return (
        <Box
            sx={{
                height: height,
                display: 'flex',
                flexDirection: 'column',
                border: `1px solid ${COLORS.GRID_BORDER}`,
                borderRadius: '4px',
                overflow: 'hidden',
                ...sx,
            }}
        >
            {/* 테이블 제목 */}
            {title && (
                <Box
                    sx={{
                        backgroundColor: COLORS.HEADER_BG,
                        color: COLORS.HEADER_TEXT,
                        padding: '0.75rem 1rem',
                        textAlign: 'center',
                    }}
                >
                    <Typography
                        variant="h6"
                        sx={{
                            fontFamily: 'Pretendard, sans-serif',
                            fontWeight: 'bold',
                            fontSize: '18px',
                        }}
                    >
                        {title}
                    </Typography>
                </Box>
            )}

            {/* DataGrid */}
            <Box sx={{ flex: 1, minHeight: 0 }}>
                <DataGrid
                    rows={rows}
                    columns={columns}
                    checkboxSelection={checkboxSelection}
                    disableRowSelectionOnClick
                    onRowSelectionModelChange={onSelectionChange}
                    rowSelectionModel={selectionModel}
                    getRowId={getRowId}
                    pageSizeOptions={[]}
                    hideFooter
                    sx={{
                        border: 'none',
                        backgroundColor: COLORS.CONTENT_BG,
                        fontFamily: 'Pretendard, sans-serif',
                        
                        // 헤더 스타일
                        '& .MuiDataGrid-columnHeaders': {
                            backgroundColor: COLORS.GRID_HEADER_BG,
                            fontWeight: 'bold',
                            fontSize: '14px',
                        },
                        
                        // 행 스타일 (줄무늬)
                        '& .MuiDataGrid-row:nth-of-type(even)': {
                            backgroundColor: COLORS.GRID_ROW_EVEN,
                        },
                        '& .MuiDataGrid-row:nth-of-type(odd)': {
                            backgroundColor: COLORS.GRID_ROW_ODD,
                        },
                        
                        // 호버 스타일
                        '& .MuiDataGrid-row:hover': {
                            backgroundColor: '#e3f2fd',
                        },
                        
                        // 셀 스타일
                        '& .MuiDataGrid-cell': {
                            fontSize: '13px',
                            borderColor: COLORS.GRID_BORDER,
                        },
                    }}
                    {...props}
                />
            </Box>
        </Box>
    );
}

export default StyledDataGrid;
