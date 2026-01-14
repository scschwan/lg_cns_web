// frontend/src/pages/export/ExportPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    Grid,
    TextField,
    Typography,
    Checkbox,
    FormControlLabel,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
} from '@mui/material';

import {
    SessionHeader,
    Pagination,
    StyledGroupBox,
    StyledDataGrid,
    ActionButton,
} from '../../components/common';

import { formatNumber, formatCurrency } from '../../utils/formatters';
import styles from './ExportPage.module.css';

// Mock Data - Clustering 결과
const generateClusteringResults = () => [
    { id: 1, clusterName: '이커머스', subClusterName: '-', keywordList: '실비,안분,이커머...', count: 1408, selected: false },
    { id: 2, clusterName: 'HM', subClusterName: '-', keywordList: '구로,구로 남스탁...', count: 402, selected: false },
    { id: 3, clusterName: 'Undefined', subClusterName: '-', keywordList: '(주) 코로넷,레이...', count: 4460, selected: false },
];

// Mock Data - 원본 테이블
const generateOriginalData = () => {
    const data = [];
    for (let i = 1; i <= 20; i++) {
        data.push({
            id: i,
            clusterName: ['Undefined', 'Undefined', 'Undefined'][i % 3],
            subClusterName: '-',
            연도: '2019',
            세그먼트: (7200 + Math.floor(Math.random() * 1000)).toString(),
            전기일: (43500 + Math.floor(Math.random() * 200)).toString(),
            문서번호: (136000000 + Math.floor(Math.random() * 1000000)).toString(),
            원가요소: '51213200',
            계정명: '지급수수료',
            원가요소이름: '지급수수료(하역...',
            'Val.in RC': (Math.floor(Math.random() * 15000000)).toString(),
            코스트센터: ['BNR8000', 'BNS8000', 'BNK8000', 'BNL8000'][i % 4],
            지점명: ['불광점', '소림점', '순천점', '송탄점'][i % 4],
            'CO 오브젝트이름': ['아동2CD_공통', '소림점', '순천 해외명품', '송탄_란참'][i % 4],
        });
    }
    return data;
};

// Mock Data - Export 결과
const generateExportData = () => {
    const data = [];
    for (let i = 1; i <= 15; i++) {
        data.push({
            id: i,
            clusterName: 'Undefined',
            subClusterName: '-',
            연도: '2019',
            세그먼트: (7200 + Math.floor(Math.random() * 500)).toString(),
            전기일: (43500 + Math.floor(Math.random() * 200)).toString(),
            문서번호: (136000000 + Math.floor(Math.random() * 1000000)).toString(),
            원가요소: '51213200',
            계정명: '지급수수료',
            원가요소이름: '지급수수료(하역...',
            'Val.in RC': (Math.floor(Math.random() * 10000000)).toString(),
            코스트센터: ['BGO7217', 'BGT8501', 'BGO8212', 'BGT8212'][i % 4],
            지점명: ['불광점', '동백 소림 해외명', '순천점', '순천점'][i % 4],
            'CO 오브젝트이름': ['불광 해외명로', '동백 소림 해외명', '순천 해외명품', '순천 해외명품'][i % 4],
        });
    }
    return data;
};

// 컬럼 목록
const availableColumns = [
    { field: '연도', checked: true },
    { field: '세그먼트', checked: true },
    { field: '전기일', checked: true },
    { field: '문서번호', checked: true },
    { field: '원가요소', checked: true },
    { field: '원가요소이름', checked: true },
    { field: '코스트센터', checked: true },
];

function ExportPage() {
    const { projectId, sessionId } = useParams();
    const navigate = useNavigate();

    const [sessionInfo] = useState({ sessionName: '지급수수료_sampl1_2025-10-11' });
    const [clusteringResults, setClusteringResults] = useState([]);
    const [originalData, setOriginalData] = useState([]);
    const [exportData, setExportData] = useState([]);

    const [originalPage, setOriginalPage] = useState(1);
    const [originalPageSize, setOriginalPageSize] = useState(1000);
    const [originalTotalRows] = useState(6270);

    const [exportPage, setExportPage] = useState(1);
    const [exportPageSize, setExportPageSize] = useState(1000);
    const [exportTotalRows] = useState(6270);

    const [searchKeyword, setSearchKeyword] = useState('');

    // 제거 열 설정
    const [columnList, setColumnList] = useState(availableColumns);
    const [selectAllColumns, setSelectAllColumns] = useState(false);

    useEffect(() => {
        setClusteringResults(generateClusteringResults());
        setOriginalData(generateOriginalData());
        setExportData(generateExportData());
    }, []);

    const handleSearch = () => alert(`"${searchKeyword}" 검색`);

    // 컬럼 선택/해제
    const handleColumnToggle = (field) => {
        setColumnList(columnList.map(col =>
            col.field === field ? { ...col, checked: !col.checked } : col
        ));
    };

    // 전체 선택
    const handleSelectAllColumns = () => {
        const newState = !selectAllColumns;
        setSelectAllColumns(newState);
        setColumnList(columnList.map(col => ({ ...col, checked: newState })));
    };

    // 선택 열 삭제 (Export에서 제외)
    const handleRemoveSelectedColumns = () => {
        const selectedColumns = columnList.filter(col => col.checked);
        alert(`${selectedColumns.length}개 열이 Export에서 제외됩니다.`);
    };

    // Excel 저장 + 세션 완료 통합
    const handleExcelSaveAndComplete = () => {
        alert('Excel 파일을 저장하고 세션을 완료합니다.');
        // 실제로는 API 호출 후 navigate
        navigate(`/projects/${projectId}/sessions`);
    };

    // Clustering 결과 컬럼
    const clusteringColumns = [
        { field: 'clusterName', headerName: '클러스터명', width: 90 },
        { field: 'subClusterName', headerName: '세부클러스터명', width: 100 },
        { field: 'keywordList', headerName: '키워드목록', width: 140 },
        { field: 'count', headerName: 'Count', width: 70, valueFormatter: (params) => formatNumber(params.value) },
    ];

    // 데이터 테이블 컬럼 (클러스터명/세부클러스터명 왼쪽 고정)
    const dataColumns = [
        { field: 'clusterName', headerName: '클러스터명', width: 85, pinned: 'left' },
        { field: 'subClusterName', headerName: '세부클러스터명', width: 95, pinned: 'left' },
        { field: '연도', headerName: '연도', width: 50 },
        { field: '세그먼트', headerName: '세그먼트', width: 70 },
        { field: '전기일', headerName: '전기일', width: 60 },
        { field: '문서번호', headerName: '문서번호', width: 95 },
        { field: '원가요소', headerName: '원가요소', width: 75 },
        { field: '계정명', headerName: '계정명', width: 75 },
        { field: '원가요소이름', headerName: '원가요소이름', width: 100 },
        { field: 'Val.in RC', headerName: 'Val.in RC', width: 80 },
        { field: '코스트센터', headerName: '코스트센터', width: 85 },
        { field: '지점명', headerName: '지점명', width: 80 },
        { field: 'CO 오브젝트이름', headerName: 'CO 오브젝트이름', width: 100 },
    ];

    const originalTotalPages = Math.ceil(originalTotalRows / originalPageSize);
    const exportTotalPages = Math.ceil(exportTotalRows / exportPageSize);

    return (
        <Container maxWidth={false} className={styles.container}>
            <Box className={styles.sessionHeader}>
                <SessionHeader sessionName={sessionInfo?.sessionName} />
            </Box>

            <Grid container spacing={1.5} className={styles.mainContent}>
                {/* 좌측 - 테이블 영역 (각 45%) */}
                <Grid item xs={12} md={8}>
                    <Box className={styles.leftPanel}>
                        {/* 원본 테이블 - 45% */}
                        <Box className={styles.tableSection}>
                            <StyledDataGrid
                                title="원본 테이블"
                                rows={originalData}
                                columns={dataColumns}
                                height="calc(45vh - 50px)"
                                pinnedColumns={['clusterName', 'subClusterName']}
                            />
                            <Pagination
                                currentPage={originalPage}
                                totalPages={originalTotalPages}
                                totalRows={originalTotalRows}
                                pageSize={originalPageSize}
                                onPageChange={setOriginalPage}
                                onPageSizeChange={(size) => { setOriginalPageSize(size); setOriginalPage(1); }}
                            />
                        </Box>

                        {/* Export 결과 - 45% */}
                        <Box className={styles.tableSection}>
                            <StyledDataGrid
                                title="Export 결과"
                                rows={exportData}
                                columns={dataColumns}
                                height="calc(45vh - 50px)"
                                pinnedColumns={['clusterName', 'subClusterName']}
                            />
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                                <Pagination
                                    currentPage={exportPage}
                                    totalPages={exportTotalPages}
                                    totalRows={exportTotalRows}
                                    pageSize={exportPageSize}
                                    onPageChange={setExportPage}
                                    onPageSizeChange={(size) => { setExportPageSize(size); setExportPage(1); }}
                                />
{/*                                 <ActionButton */}
{/*                                     variant="export" */}
{/*                                     size="medium" */}
{/*                                     onClick={handleExcelSaveAndComplete} */}
{/*                                     sx={{ backgroundColor: '#4caf50', minWidth: '120px' }} */}
{/*                                 > */}
{/*                                     Excel 저장 */}
{/*                                 </ActionButton> */}
                            </Box>
                        </Box>
                    </Box>
                </Grid>

                {/* 우측 영역 */}
                <Grid item xs={12} md={4}>
                    <Box className={styles.rightPanel}>
                        {/* Clustering 결과 */}
                        <StyledGroupBox title="Clustering 결과">
                            <Typography sx={{ fontSize: '11px', color: '#e91e63', mb: 0.5 }}>
                                * 클러스터명은 직접 수정이 가능합니다.
                            </Typography>
                            <Typography sx={{ fontSize: '11px', color: '#e91e63', mb: 1 }}>
                                * 각 항목을 우클릭하여 세부 클러스터링 메뉴로 이동할 수 있습니다.
                            </Typography>
                            <StyledDataGrid
                                rows={clusteringResults}
                                columns={clusteringColumns}
                                height="150px"
                            />
                        </StyledGroupBox>

                        {/* 제거 열 설정 */}
                        <StyledGroupBox title="제거 열 설정" sx={{
                                                                                                            // 1. 박스 높이를 '내용물 크기'에 딱 맞춥니다 (늘어나지 않게 함)
                                                                                                            height: 'fit-content',

                                                                                                            // 2. 내부 콘텐츠 영역의 상하 여백을 강제로 줄입니다.
                                                                                                            // (StyledGroupBox 내부 구조에 따라 div나 .MuiBox-root 등을 타겟팅)
                                                                                                            '& > div:last-child': {
                                                                                                            padding: ' !important', // 상하 8px, 좌우 16px (기존 대비 절반 이하로 축소)
                                                                                                            },

                                                                                                            }}>

                            <Typography sx={{ fontSize: '11px', color: '#e91e63', mb: 1 }}>
                                * 선택한 열 정보만 출력하도록 지원합니다.
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Typography sx={{ fontSize: '12px', fontWeight: 'bold' }}>컬럼명</Typography>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            size="small"
                                            checked={selectAllColumns}
                                            onChange={handleSelectAllColumns}
                                        />
                                    }
                                    label={<Typography sx={{ fontSize: '11px' }}>전체 선택</Typography>}
                                />
                            </Box>
                            <Box className={styles.columnList}>
                                {columnList.map((col) => (
                                    <Box
                                        key={col.field}
                                        className={`${styles.columnItem} ${col.checked ? styles.columnItemSelected : ''}`}
                                        onClick={() => handleColumnToggle(col.field)}
                                    >
                                        <Checkbox
                                            size="small"
                                            checked={col.checked}
                                            onChange={() => handleColumnToggle(col.field)}
                                        />
                                        <Typography sx={{ fontSize: '12px' }}>{col.field}</Typography>
                                    </Box>
                                ))}
                            </Box>
                            <ActionButton
                                variant="delete"
                                size="small"
                                onClick={handleRemoveSelectedColumns}
                                sx={{ width: '100%', mt: 1, backgroundColor: '#f44336' }}
                            >
                                선택 열 삭제
                            </ActionButton>
                        </StyledGroupBox>
                         {/* 완료 버튼 */}
                                                <Box className={styles.completeButtonWrapper}>
                                                    <ActionButton
                                                        variant="complete"
                                                        size="large"
                                                        onClick={handleExcelSaveAndComplete}
                                                        sx={{ width: '100%' }}
                                                    >
                                                        Excel 내보내기 & 세션 완료
                                                    </ActionButton>
                                                </Box>
                    </Box>
                </Grid>
            </Grid>
        </Container>
    );
}

export default ExportPage;
