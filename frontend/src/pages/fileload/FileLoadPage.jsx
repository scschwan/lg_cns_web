// frontend/src/pages/fileload/FileLoadPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    Grid,
    Typography,
    Paper,
    Tabs,
    Tab,
    TextField,
    Checkbox,
    FormControlLabel,
    Select,
    MenuItem,
} from '@mui/material';

import {
    SessionHeader,
    Pagination,
    StyledGroupBox,
    StyledDataGrid,
    ActionButton,
} from '../../components/common';

import { formatNumber } from '../../utils/formatters';
import styles from './FileLoadPage.module.css';

// Mock Data
const generateMockRawData = () => {
    const data = [];
    for (let i = 1; i <= 30; i++) {
        data.push({
            id: i,
            연도: '2019',
            세그먼트: (7000 + Math.floor(Math.random() * 2000)).toString(),
            전기일: (43000 + Math.floor(Math.random() * 1000)).toString(),
            문서번호: (134000000 + Math.floor(Math.random() * 1000000)).toString(),
            원가요소: '51213200',
            계정명: '지급수수료',
            원가요소이름: '지급수수료',
        });
    }
    return data;
};

const generateMockProcessData = () => {
    const data = [];
    for (let i = 1; i <= 30; i++) {
        data.push({
            id: i,
            연도: '2019',
            세그먼트: (7000 + Math.floor(Math.random() * 2000)).toString(),
            전기일: (43000 + Math.floor(Math.random() * 1000)).toString(),
            문서번호: (134000000 + Math.floor(Math.random() * 1000000)).toString(),
            원가요소: '51213200',
            계정명: '지급수수료',
            원가요소이름: '지급수수료',
        });
    }
    return data;
};

function FileLoadPage() {
    const { projectId, sessionId } = useParams();
    const navigate = useNavigate();

    // 세션 정보
    const [sessionInfo] = useState({
        sessionName: '지급수수료_sampl1_2025-10-11'
    });

    // 데이터
    const [rawData, setRawData] = useState([]);
    const [processData, setProcessData] = useState([]);

    // 페이지네이션
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(1000);
    const [totalRows] = useState(6270);

    // 탭 상태
    const [activeTab, setActiveTab] = useState(0);

    // 제거 열 설정
    const [deleteColumns, setDeleteColumns] = useState([
        { id: 1, columnName: '연도', selected: false },
        { id: 2, columnName: '세그먼트', selected: false },
        { id: 3, columnName: '전기일', selected: false },
        { id: 4, columnName: '문서번호', selected: false },
        { id: 5, columnName: '원가요소', selected: false },
        { id: 6, columnName: '계정명', selected: false },
    ]);

    // 데이터 삭제 탭
    const [searchKeyword, setSearchKeyword] = useState('');
    const [selectAll, setSelectAll] = useState(false);

    // 표준화 설정
    const [keyColumn, setKeyColumn] = useState('');
    const [valueColumn, setValueColumn] = useState('');
    const [standardData, setStandardData] = useState([
        { id: 1, keyValue: '인터넷몰', targetValue: '인터넷몰', count: 156 },
        { id: 2, keyValue: '실비', targetValue: '실비', count: 89 },
        { id: 3, keyValue: '안분', targetValue: '안분', count: 234 },
    ]);

    // 필수 항목 설정
    const [columnMapping, setColumnMapping] = useState({
        세목열: '계정명',
        코스트센터열: 'CO 오브젝트이름',
        공급업체열: '상계계정이름',
        금액열: 'Val.in RC',
        타겟열: '이름',
    });

    // 컬럼 옵션
    const columnOptions = ['연도', '세그먼트', '전기일', '문서번호', '원가요소', '계정명', '원가요소이름', 'Val.in RC', '코스트센터', '지점명', 'CO 오브젝트이름', '상계계정이름', '이름'];

    useEffect(() => {
        setRawData(generateMockRawData());
        setProcessData(generateMockProcessData());
    }, []);

    // 데이터 원복
    const handleDataRestore = () => {
        alert('데이터가 원복되었습니다.');
    };

    // 데이터 삭제
    const handleDataDelete = () => {
        alert('선택된 데이터가 삭제되었습니다.');
    };

    // 표준화 수행
    const handleStandardize = () => {
        alert(`표준화 수행: Key(${keyColumn}) → Value(${valueColumn})`);
    };

    // 완료 버튼
    const handleComplete = () => {
        navigate(`/projects/${projectId}/sessions/${sessionId}/preprocessing`);
    };

    // 원본 데이터 테이블 컬럼
    const rawDataColumns = [
        { field: '연도', headerName: '연도', width: 70 },
        { field: '세그먼트', headerName: '세그먼트', width: 90 },
        { field: '전기일', headerName: '전기일', width: 80 },
        { field: '문서번호', headerName: '문서번호', width: 110 },
        { field: '원가요소', headerName: '원가요소', width: 100 },
        { field: '계정명', headerName: '계정명', width: 100 },
        { field: '원가요소이름', headerName: '원가요소이름', width: 110 },
    ];

    // 삭제 컬럼 테이블 컬럼
    const deleteColumnColumns = [
        {
            field: 'selected',
            headerName: '',
            width: 50,
            renderCell: (params) => (
                <Checkbox
                    size="small"
                    checked={params.value}
                    onChange={(e) => {
                        const updated = deleteColumns.map(col =>
                            col.id === params.row.id
                                ? { ...col, selected: e.target.checked }
                                : col
                        );
                        setDeleteColumns(updated);
                    }}
                />
            ),
        },
        { field: 'columnName', headerName: '컬럼명', flex: 1 },
    ];

    // 표준화 테이블 컬럼
    const standardColumns = [
        { field: 'keyValue', headerName: 'Key 값', flex: 1 },
        { field: 'targetValue', headerName: '대상값', flex: 1 },
        { field: 'count', headerName: 'Count', width: 80 },
    ];

    const totalPages = Math.ceil(totalRows / pageSize);

    return (
        <Container maxWidth={false} className={styles.container}>
            {/* 세션 헤더 */}
            <Box className={styles.sessionHeader}>
                <SessionHeader sessionName={sessionInfo?.sessionName} />
            </Box>

            {/* 메인 콘텐츠 */}
            <Grid container spacing={2} className={styles.mainContent}>
                {/* 좌측 영역 - 원본/가공 데이터 테이블 */}
                <Grid item xs={12} md={8}>
                    <Box className={styles.leftPanel}>
                        {/* 두 테이블 나란히 */}
                        <Grid container spacing={1}>
                            <Grid item xs={6}>
                                <StyledDataGrid
                                    title="원본 데이터"
                                    rows={rawData}
                                    columns={rawDataColumns}
                                    height="calc(100vh - 220px)"
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <StyledDataGrid
                                    title="가공 데이터"
                                    rows={processData}
                                    columns={rawDataColumns}
                                    height="calc(100vh - 220px)"
                                />
                            </Grid>
                        </Grid>

                        {/* 페이지네이션 */}
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalRows={totalRows}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={(size) => {
                                setPageSize(size);
                                setCurrentPage(1);
                            }}
                        />
                    </Box>
                </Grid>

                {/* 우측 영역 */}
                <Grid item xs={12} md={4}>
                    <Box className={styles.rightPanel}>
                        {/* 탭 - 제거 열 설정 / 데이터 삭제 */}
                        <Paper className={styles.tabSection}>
                            <Tabs
                                value={activeTab}
                                onChange={(e, v) => setActiveTab(v)}
                                variant="fullWidth"
                                sx={{ borderBottom: '1px solid #ddd' }}
                            >
                                <Tab label="제거 열 설정" sx={{ fontSize: '13px' }} />
                                <Tab label="데이터 삭제" sx={{ fontSize: '13px' }} />
                            </Tabs>

                            <Box className={styles.tabContent}>
                                {activeTab === 0 && (
                                    <Box>
                                        {/* 기준 열 선택 */}
                                        <Box sx={{ mb: 1 }}>
                                            <Typography sx={{ fontSize: '12px', mb: 0.5 }}>
                                                기준 열 선택:
                                            </Typography>
                                            <Select
                                                size="small"
                                                fullWidth
                                                value=""
                                                displayEmpty
                                            >
                                                <MenuItem value="">데이터 삭제 기준 열 선택</MenuItem>
                                                {columnOptions.map(col => (
                                                    <MenuItem key={col} value={col}>{col}</MenuItem>
                                                ))}
                                            </Select>
                                        </Box>
                                        <StyledDataGrid
                                            rows={deleteColumns}
                                            columns={deleteColumnColumns}
                                            height="150px"
                                        />
                                    </Box>
                                )}

                                {activeTab === 1 && (
                                    <Box>
                                        {/* 검색 키워드 입력 */}
                                        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                            <TextField
                                                size="small"
                                                placeholder="검색 키워드 입력"
                                                value={searchKeyword}
                                                onChange={(e) => setSearchKeyword(e.target.value)}
                                                sx={{ flex: 1 }}
                                            />
                                            <ActionButton variant="search" size="small">
                                                검색
                                            </ActionButton>
                                        </Box>

                                        {/* 전체 선택 */}
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    size="small"
                                                    checked={selectAll}
                                                    onChange={(e) => setSelectAll(e.target.checked)}
                                                />
                                            }
                                            label={<Typography sx={{ fontSize: '12px' }}>전체 선택</Typography>}
                                        />

                                        {/* 버튼 */}
                                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                            <ActionButton
                                                variant="apply"
                                                size="small"
                                                onClick={handleDataRestore}
                                                sx={{ flex: 1, backgroundColor: '#4CAF50' }}
                                            >
                                                데이터 원복
                                            </ActionButton>
                                            <ActionButton
                                                variant="delete"
                                                size="small"
                                                onClick={handleDataDelete}
                                                sx={{ flex: 1 }}
                                            >
                                                데이터 삭제
                                            </ActionButton>
                                        </Box>
                                    </Box>
                                )}
                            </Box>
                        </Paper>

                        {/* 코스트센터/공급업체 명 표준화 */}
                        <StyledGroupBox title="코스트센터/공급업체 명 표준화">
                            <Box sx={{ mb: 1 }}>
                                <Typography sx={{ fontSize: '12px', mb: 0.5 }}>key 열 선택:</Typography>
                                <Select
                                    size="small"
                                    fullWidth
                                    value={keyColumn}
                                    onChange={(e) => setKeyColumn(e.target.value)}
                                    displayEmpty
                                >
                                    <MenuItem value="">-- Key 컬럼 선택 --</MenuItem>
                                    {columnOptions.map(col => (
                                        <MenuItem key={col} value={col}>{col}</MenuItem>
                                    ))}
                                </Select>
                            </Box>

                            <Box sx={{ mb: 1 }}>
                                <Typography sx={{ fontSize: '12px', mb: 0.5 }}>변경 열 선택:</Typography>
                                <Select
                                    size="small"
                                    fullWidth
                                    value={valueColumn}
                                    onChange={(e) => setValueColumn(e.target.value)}
                                    displayEmpty
                                >
                                    <MenuItem value="">-- 대상 컬럼 선택 --</MenuItem>
                                    {columnOptions.map(col => (
                                        <MenuItem key={col} value={col}>{col}</MenuItem>
                                    ))}
                                </Select>
                            </Box>

                            <StyledDataGrid
                                rows={standardData}
                                columns={standardColumns}
                                height="120px"
                            />

                            <ActionButton
                                variant="apply"
                                size="small"
                                onClick={handleStandardize}
                                sx={{ width: '100%', mt: 1, backgroundColor: '#2196F3' }}
                            >
                                표준화 수행
                            </ActionButton>
                        </StyledGroupBox>

                        {/* 필수 항목 설정 */}
                        <StyledGroupBox title="필수 항목 설정">
                            <Box className={styles.mappingForm}>
                                {[
                                    { key: '세목열', label: '세목 열 :' },
                                    { key: '코스트센터열', label: '코스트센터 열 :' },
                                    { key: '공급업체열', label: '공급업체 열 :' },
                                    { key: '금액열', label: '금액 열 :' },
                                    { key: '타겟열', label: '타겟 열 :' },
                                ].map(({ key, label }) => (
                                    <Box key={key} className={styles.mappingRow}>
                                        <Typography className={styles.mappingLabel}>
                                            {label}
                                        </Typography>
                                        <Select
                                            size="small"
                                            value={columnMapping[key]}
                                            onChange={(e) => setColumnMapping(prev => ({
                                                ...prev,
                                                [key]: e.target.value
                                            }))}
                                            className={styles.mappingSelect}
                                        >
                                            {columnOptions.map(col => (
                                                <MenuItem key={col} value={col}>{col}</MenuItem>
                                            ))}
                                        </Select>
                                    </Box>
                                ))}
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
                                완  료
                            </ActionButton>
                        </Box>
                    </Box>
                </Grid>
            </Grid>
        </Container>
    );
}

export default FileLoadPage;
