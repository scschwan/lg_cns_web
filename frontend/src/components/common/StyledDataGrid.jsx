// frontend/src/components/common/StyledDataGrid.jsx

import React, { useState, useRef, useCallback } from 'react';
import { Box, Typography, Paper } from '@mui/material';

/**
 * StyledDataGrid - 컬럼 리사이즈 및 드래그 순서 변경 지원
 *
 * Props:
 * - title: 테이블 제목
 * - rows: 데이터 배열
 * - columns: 컬럼 정의 배열 [{ field, headerName, width, flex, renderCell, valueFormatter, pinned }]
 * - height: 테이블 높이
 * - pinnedColumns: 고정할 컬럼 field 배열 (왼쪽 고정)
 * - onRowClick: 행 클릭 핸들러
 * - onSelectionChange: 선택 변경 핸들러
 */
function StyledDataGrid({
    title,
    rows = [],
    columns = [],
    height = '300px',
    pinnedColumns = [],
    onRowClick,
    onSelectionChange,
}) {
    // 컬럼 너비 상태 (리사이즈용)
    const [columnWidths, setColumnWidths] = useState(() => {
        const widths = {};
        columns.forEach(col => {
            widths[col.field] = col.width || 100;
        });
        return widths;
    });

    // 컬럼 순서 상태 (드래그용)
    const [columnOrder, setColumnOrder] = useState(() => columns.map(col => col.field));

    // 리사이즈 상태
    const [resizing, setResizing] = useState(null);
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // 리사이즈 시작
    const handleResizeStart = useCallback((e, field) => {
        e.preventDefault();
        e.stopPropagation();
        setResizing(field);
        startX.current = e.clientX;
        startWidth.current = columnWidths[field];

        const handleMouseMove = (moveEvent) => {
            const diff = moveEvent.clientX - startX.current;
            const newWidth = Math.max(50, startWidth.current + diff);
            setColumnWidths(prev => ({
                ...prev,
                [field]: newWidth
            }));
        };

        const handleMouseUp = () => {
            setResizing(null);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [columnWidths]);

    // 드래그 시작
    const handleDragStart = useCallback((e, field) => {
        // pinned 컬럼은 드래그 불가
        if (pinnedColumns.includes(field)) {
            e.preventDefault();
            return;
        }
        setDragging(field);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', field);
    }, [pinnedColumns]);

    // 드래그 오버
    const handleDragOver = useCallback((e, field) => {
        e.preventDefault();
        if (pinnedColumns.includes(field)) return;
        setDragOver(field);
    }, [pinnedColumns]);

    // 드롭
    const handleDrop = useCallback((e, targetField) => {
        e.preventDefault();
        if (pinnedColumns.includes(targetField)) return;

        const sourceField = dragging;
        if (sourceField && sourceField !== targetField) {
            setColumnOrder(prev => {
                const newOrder = [...prev];
                const sourceIndex = newOrder.indexOf(sourceField);
                const targetIndex = newOrder.indexOf(targetField);
                newOrder.splice(sourceIndex, 1);
                newOrder.splice(targetIndex, 0, sourceField);
                return newOrder;
            });
        }
        setDragging(null);
        setDragOver(null);
    }, [dragging, pinnedColumns]);

    // 드래그 종료
    const handleDragEnd = useCallback(() => {
        setDragging(null);
        setDragOver(null);
    }, []);

    // 정렬된 컬럼 (pinned 먼저, 나머지는 순서대로)
    const sortedColumns = React.useMemo(() => {
        const pinned = columns.filter(col => pinnedColumns.includes(col.field));
        const unpinned = columnOrder
            .filter(field => !pinnedColumns.includes(field))
            .map(field => columns.find(col => col.field === field))
            .filter(Boolean);
        return [...pinned, ...unpinned];
    }, [columns, columnOrder, pinnedColumns]);

    // 셀 값 포맷팅
    const formatCellValue = (column, row) => {
        const value = row[column.field];

        if (column.renderCell) {
            return column.renderCell({ value, row });
        }

        if (column.valueFormatter) {
            return column.valueFormatter({ value, row });
        }

        return value ?? '';
    };

    return (
        <Paper
            elevation={0}
            sx={{
                height,
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid #ddd',
                borderRadius: '4px',
                overflow: 'hidden',
                backgroundColor: '#fff',
            }}
        >
            {/* 제목 */}
            {title && (
                <Box sx={{
                    backgroundColor: '#1976d2',
                    color: 'white',
                    px: 1.5,
                    py: 0.75,
                    fontSize: '13px',
                    fontWeight: 'bold',
                }}>
                    {title}
                </Box>
            )}

            {/* 테이블 컨테이너 */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    tableLayout: 'fixed',
                    minWidth: 'max-content',
                }}>
                    {/* 헤더 */}
                    <thead>
                        <tr style={{ backgroundColor: '#f5f5f5' }}>
                            {sortedColumns.map((column, index) => {
                                const isPinned = pinnedColumns.includes(column.field);
                                const isDragOver = dragOver === column.field;
                                const isDragging = dragging === column.field;

                                return (
                                    <th
                                        key={column.field}
                                        draggable={!isPinned}
                                        onDragStart={(e) => handleDragStart(e, column.field)}
                                        onDragOver={(e) => handleDragOver(e, column.field)}
                                        onDrop={(e) => handleDrop(e, column.field)}
                                        onDragEnd={handleDragEnd}
                                        style={{
                                            width: columnWidths[column.field] || column.width || 100,
                                            minWidth: 50,
                                            padding: '8px 6px',
                                            textAlign: 'left',
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            borderBottom: '2px solid #ddd',
                                            borderRight: '1px solid #e0e0e0',
                                            position: 'relative',
                                            cursor: isPinned ? 'default' : 'grab',
                                            backgroundColor: isPinned ? '#e3f2fd' : (isDragOver ? '#bbdefb' : '#f5f5f5'),
                                            opacity: isDragging ? 0.5 : 1,
                                            userSelect: 'none',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {column.headerName || column.field}

                                        {/* 리사이즈 핸들 */}
                                        <div
                                            onMouseDown={(e) => handleResizeStart(e, column.field)}
                                            style={{
                                                position: 'absolute',
                                                right: 0,
                                                top: 0,
                                                bottom: 0,
                                                width: '6px',
                                                cursor: 'col-resize',
                                                backgroundColor: resizing === column.field ? '#1976d2' : 'transparent',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor = '#90caf9';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (resizing !== column.field) {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                }
                                            }}
                                        />
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>

                    {/* 바디 */}
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={sortedColumns.length}
                                    style={{
                                        textAlign: 'center',
                                        padding: '20px',
                                        color: '#999',
                                        fontSize: '13px',
                                    }}
                                >
                                    데이터가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, rowIndex) => (
                                <tr
                                    key={row.id || rowIndex}
                                    onClick={() => onRowClick && onRowClick(row)}
                                    style={{
                                        backgroundColor: rowIndex % 2 === 0 ? '#fff' : '#fafafa',
                                        cursor: onRowClick ? 'pointer' : 'default',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#e3f2fd';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = rowIndex % 2 === 0 ? '#fff' : '#fafafa';
                                    }}
                                >
                                    {sortedColumns.map((column) => {
                                        const isPinned = pinnedColumns.includes(column.field);

                                        return (
                                            <td
                                                key={column.field}
                                                style={{
                                                    width: columnWidths[column.field] || column.width || 100,
                                                    padding: '6px',
                                                    fontSize: '12px',
                                                    borderBottom: '1px solid #eee',
                                                    borderRight: '1px solid #f0f0f0',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    backgroundColor: isPinned ? '#f5f5f5' : 'inherit',
                                                }}
                                            >
                                                {formatCellValue(column, row)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </Box>
        </Paper>
    );
}

export default StyledDataGrid;
