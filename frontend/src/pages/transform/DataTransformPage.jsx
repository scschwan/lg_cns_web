// frontend/src/pages/transform/DataTransformPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    Grid,
    TextField,
    Select,
    MenuItem,
    Typography,
    Checkbox,
    FormControlLabel,
} from '@mui/material';

import {
    SessionHeader,
    Pagination,
    StyledGroupBox,
    StyledDataGrid,
    ActionButton,
} from '../../components/common';

import { formatNumber, formatCurrency } from '../../utils/formatters';
import styles from './DataTransformPage.module.css';

// Mock Data - 원본 키워드 데이터
const generateOriginalData = () => {
    const data = [];
    for (let i = 1; i <= 15; i++) {
        data.push({
            id: i,
            연도: '2019',
            세그먼트: (8000 + Math.floor(Math.random() * 500)).toString(),
            전기일: (43000 + Math.floor(Math.random() * 1000)).toString(),
            문서번호: (137000000 + Math.floor(Math.random() * 1000000)).toString(),
            원가요소: '51213200',
            계정명: '지급수수료',
            원가요소이름: '지급수수료(하역...',
            'Val.in RC': (Math.floor(Math.random() * 10000000)).toString(),
            코스트센터: 'BGU' + (8000 + i),
            지점명: ['평택점', '광주2점', '구로점', '인터넷몰'][i % 4],
            'CO 오브젝트이름': ['평택 E', '광주2점', '구로점', '인터넷몰'][i % 4],
        });
    }
    return data;
};

// Mock Data - 변환 키워드 데이터
const generateTransformData = () => {
    const data = [];
    for (let i = 1; i <= 12; i++) {
        data.push({
            id: i,
            연도: '2019',
            세그먼트: (8100 + Math.floor(Math.random() * 100)).toString(),
            전기일: (43000 + Math.floor(Math.random() * 500)).toString(),
            문서번호: (133000000 + Math.floor(Math.random() * 1000000)).toString(),
            원가요소: '51213200',
            계정명: '지급수수료',
            원가요소이름: '지급수수료(하역...',
            'Val.in RC': (Math.floor(Math.random() * 15000000)).toString(),
            코스트센터: 'BFK' + (8000 + i),
            지점명: '외류CU_공통',
            'CO 오브젝트이름': '본부 E',
        });
    }
    return data;
};

// Mock Data - 키워드 요약
const generateKeywordSummary = () => [
    { id: 1, value: '이커머스', count: 1408, amount: 16984864},
    { id: 2, value: '실비', count: 1403, amount: 0 },
    { id: 3, value: '안분', count: 1403, amount: 0 },
    { id: 4, value: '지급수수료', count: 1403, amount: 0 },
    { id: 5, value: '물류수수료', count: 1272, amount: 4422146476 },
    { id: 6, value: '아웃소싱수수료', count: 878, amount: 7954918617 },
    { id: 7, value: '항만초도분배비용', count: 505, amount: 765694105},
    { id: 8, value: '인천', count: 376, amount: 354202039 },
    { id: 9, value: '수수료', count: 312, amount: 3084676256 },
    { id: 10, value: '아웃소싱', count: 301, amount: 3069556310 },
    { id: 11, value: '인타임', count: 301, amount: 3069556310 },
];

// Mock Data - 키워드 변환 테이블
const generateKeywordMatch = () => [
    { id: 1, value: '지급수수료', count: 1403, amount: 0, selected: false },
    { id: 2, value: '물류수수료', count: 1272, amount: 4422146476, selected: false },
    { id: 3, value: '아웃소싱수수료', count: 878, amount: 7954918617, selected: false },
    { id: 4, value: '수수료', count: 312, amount: 3084676256, selected: true },
    { id: 5, value: '아동물류수수료', count: 54, amount: 45397898, selected: false },
    { id: 6, value: '남성스탁물류수수료', count: 52, amount: 48519580, selected: false },
    { id: 7, value: '해외제화물류수수료', count: 46, amount: 10416368, selected: false },
    { id: 8, value: '스포츠물류수수료', count: 41, amount: 62009839, selected: false },
];

function DataTransformPage() {
    const { projectId, sessionId } = useParams();
    const navigate = useNavigate();

    const [sessionInfo] = useState({ sessionName: '지급수수료_sampl1_2025-10-11' });
    const [originalData, setOriginalData] = useState([]);
    const [transformData, setTransformData] = useState([]);
    const [keywordSummary, setKeywordSummary] = useState([]);
    const [keywordMatch, setKeywordMatch] = useState([]);

    const [originalPage, setOriginalPage] = useState(1);
    const [originalPageSize, setOriginalPageSize] = useState(1000);
    const [originalTotalRows] = useState(6270);

    const [transformPage, setTransformPage] = useState(1);
    const [transformPageSize, setTransformPageSize] = useState(1000);
    const [transformTotalRows] = useState(312);

    const [amountUnit, setAmountUnit] = useState('원');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [modifyKeyword, setModifyKeyword] = useState('');
    const [selectAllMatch, setSelectAllMatch] = useState(false);

    const [includeCostCenter, setIncludeCostCenter] = useState(true);
    const [includeSupplier, setIncludeSupplier] = useState(true);

    useEffect(() => {
        setOriginalData(generateOriginalData());
        setTransformData(generateTransformData());
        setKeywordSummary(generateKeywordSummary());
        setKeywordMatch(generateKeywordMatch());
    }, []);

    const handleSearch = () => alert(`"${searchKeyword}" 검색 실행`);
    const handleModify = () => {
        const selected = keywordMatch.filter(k => k.selected);
        if (selected.length > 0 && modifyKeyword.trim()) {
            alert(`선택된 ${selected.length}개 키워드를 "${modifyKeyword}"로 변환`);
        }
    };
    const handleClusterCheck = () => {
        alert(`Cluster 확인\n- 코스트센터 포함: ${includeCostCenter}\n- 공급업체 포함: ${includeSupplier}`);
    };
    const handleComplete = () => navigate(`/projects/${projectId}/sessions/${sessionId}/clustering`);

    const dataColumns = [
        { field: '연도', headerName: '연도', width: 55 },
        { field: '세그먼트', headerName: '세그먼트', width: 75 },
        { field: '전기일', headerName: '전기일', width: 65 },
        { field: '문서번호', headerName: '문서번호', width: 100 },
        { field: '원가요소', headerName: '원가요소', width: 80 },
        { field: '계정명', headerName: '계정명', width: 80 },
        { field: '원가요소이름', headerName: '원가요소이름', width: 110 },
        { field: 'Val.in RC', headerName: 'Val.in RC', width: 90 },
        { field: '코스트센터', headerName: '코스트센터', width: 90 },
        { field: '지점명', headerName: '지점명', width: 85 },
        { field: 'CO 오브젝트이름', headerName: 'CO 오브젝트이름', width: 110 },
    ];

    const summaryColumns = [
//         { field: 'marker', headerName: '', width: 30, renderCell: (params) => params.row.selected ? <Box sx={{ width: 8, height: 8, backgroundColor: '#2196F3' }} /> : null },
        { field: 'value', headerName: 'Value', width: 120 },
        { field: 'count', headerName: 'Count', width: 70, valueFormatter: (params) => formatNumber(params.value) },
        { field: 'amount', headerName: '합산금액', width: 120, valueFormatter: (params) => formatCurrency(params.value, amountUnit) },
    ];

    const matchColumns = [
        { field: 'selected', headerName: '', width: 40, renderCell: (params) => (
            <Checkbox size="small" checked={params.value} onChange={(e) => {
                setKeywordMatch(keywordMatch.map(k => k.id === params.row.id ? { ...k, selected: e.target.checked } : k));
            }} />
        )},
        { field: 'value', headerName: 'Value', width: 120 },
        { field: 'count', headerName: 'Count', width: 70, valueFormatter: (params) => formatNumber(params.value) },
        { field: 'amount', headerName: '합산금액', width: 120, valueFormatter: (params) => formatCurrency(params.value, amountUnit) },
    ];

    const originalTotalPages = Math.ceil(originalTotalRows / originalPageSize);
    const transformTotalPages = Math.ceil(transformTotalRows / transformPageSize);

    return (
        <Container maxWidth={false} className={styles.container}>
            <Box className={styles.sessionHeader}>
                <SessionHeader sessionName={sessionInfo?.sessionName} />
            </Box>

            <Grid container spacing={1.5} className={styles.mainContent}>
                {/* 좌측 - 테이블 영역 (각 45%) */}
                <Grid item xs={12} md={7.5}>
                    <Box className={styles.leftPanel}>
                        {/* 원본 키워드 데이터 - 45% */}
                        <Box className={styles.tableSection}>
                            <StyledDataGrid
                                title="원본 키워드 데이터"
                                rows={originalData}
                                columns={dataColumns}
                                height="calc(45vh - 60px)"
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

                        {/* 변환 키워드 데이터 - 45% */}
                        <Box className={styles.tableSection}>
                            <StyledDataGrid
                                title="변환 키워드 데이터"
                                rows={transformData}
                                columns={dataColumns}
                                height="calc(45vh - 60px)"
                            />
                            <Pagination
                                currentPage={transformPage}
                                totalPages={transformTotalPages}
                                totalRows={transformTotalRows}
                                pageSize={transformPageSize}
                                onPageChange={setTransformPage}
                                onPageSizeChange={(size) => { setTransformPageSize(size); setTransformPage(1); }}
                            />
                        </Box>
                    </Box>
                </Grid>

                {/* 우측 영역 */}
                <Grid item xs={12} md={4.5} sx={{
                                                    // 1. 박스 높이를 '내용물 크기'에 딱 맞춥니다 (늘어나지 않게 함)
                                                    height: 'fit-content',

                                                    // 2. 내부 콘텐츠 영역의 상하 여백을 강제로 줄입니다.
                                                    // (StyledGroupBox 내부 구조에 따라 div나 .MuiBox-root 등을 타겟팅)
                                                    '& > div:last-child': {
                                                    padding: ' !important', // 상하 8px, 좌우 16px (기존 대비 절반 이하로 축소)
                                                    },

                                                    }}>
                    <Box className={styles.rightPanel}>
                        {/* 키워드 요약 */}
                        <StyledGroupBox title="키워드 요약">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Typography sx={{ fontSize: '15px' }}>단위</Typography>
                                <Select size="small" value={amountUnit} onChange={(e) => setAmountUnit(e.target.value)} sx={{ minWidth: 70 }}>
                                    <MenuItem value="원">원</MenuItem>
                                    <MenuItem value="천원">천원</MenuItem>
                                    <MenuItem value="백만원">백만원</MenuItem>
                                </Select>
                            </Box>
                            <StyledDataGrid rows={keywordSummary} columns={summaryColumns} height="calc(30vh - 60px)" />
                        </StyledGroupBox>

                        {/* 키워드 변환 */}
                        <StyledGroupBox title="키워드 변환">
                            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                <TextField size="small" placeholder="수수" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} sx={{ flex: 1 }} />
                                <ActionButton variant="search" size="small" onClick={handleSearch}>검 색</ActionButton>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <FormControlLabel
                                    control={<Checkbox size="small" checked={selectAllMatch} onChange={(e) => {
                                        setSelectAllMatch(e.target.checked);
                                        setKeywordMatch(keywordMatch.map(k => ({ ...k, selected: e.target.checked })));
                                    }} />}
                                    label={<Typography sx={{ fontSize: '11px' }}>전체 선택</Typography>}
                                />
                                <Typography sx={{ fontSize: '11px', color: '#666' }}>다음 키워드로 변경</Typography>
                                <TextField size="small" placeholder="변환 키워드 입력" value={modifyKeyword} onChange={(e) => setModifyKeyword(e.target.value)} sx={{ width: 200 }} />
                                <ActionButton variant="apply" size="small" onClick={handleModify} sx={{ backgroundColor: '#ff9800' }}>변 환</ActionButton>
                            </Box>
                            <StyledDataGrid rows={keywordMatch} columns={matchColumns} height="calc(30vh - 60px)" />
                        </StyledGroupBox>

                        {/* Cluster 설정 - height 축소 (10~15%) */}
                        <StyledGroupBox title="Cluster 설정">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                <Typography sx={{ fontSize: '12px' }}>필수 포함</Typography>
                                <FormControlLabel
                                    control={<Checkbox size="small" checked={includeCostCenter} onChange={(e) => setIncludeCostCenter(e.target.checked)} />}
                                    label={<Typography sx={{ fontSize: '12px' }}>코스트센터</Typography>}
                                />
                                <FormControlLabel
                                    control={<Checkbox size="small" checked={includeSupplier} onChange={(e) => setIncludeSupplier(e.target.checked)} />}
                                    label={<Typography sx={{ fontSize: '12px' }}>공급업체</Typography>}
                                />
                                <ActionButton variant="apply" size="small" onClick={handleClusterCheck} sx={{ backgroundColor: '#e91e63' }}>
                                    Cluster 미리보기
                                </ActionButton>
{/*                                 <ActionButton variant="complete" size="small" onClick={handleComplete} sx={{ backgroundColor: '#4caf50' }}> */}
{/*                                     완 료 */}
{/*                                 </ActionButton> */}
                            </Box>
                        </StyledGroupBox>

                         {/* 완료 버튼 */}
                                                <Box className={styles.completeButtonWrapper}>
                                                    <ActionButton
                                                        variant="complete"
                                                        size="large"
                                                        onClick={handleComplete}
                                                        sx={{ width: '100%' }}
                                                    >
                                                        완 료
                                                    </ActionButton>
                                                </Box>
                    </Box>
                </Grid>
            </Grid>
        </Container>
    );
}

export default DataTransformPage;
