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

import {
    getFileLoadData,
    getDeleteColumnList,
    getStandardList,
    getSessionInfo,
} from '../../services/mockDataService';

import { formatNumber } from '../../utils/formatters';
import styles from './FileLoadPage.module.css';

function FileLoadPage() {
    const { projectId, sessionId } = useParams();
    const navigate = useNavigate();

    // 세션 정보
    const [sessionInfo, setSessionInfo] = useState(null);

    // 데이터
    const [rawData, setRawData] = useState([]);
    const [processData, setProcessData] = useState([]);
    const [deleteColumns, setDeleteColumns] = useState([]);
    const [deleteData, setDeleteData] = useState([]);
    const [standardList, setStandardList] = useState([]);

    // 페이지네이션
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(1000);
    const [totalRows, setTotalRows] = useState(0);

    // 탭 상태
    const [activeTab, setActiveTab] = useState(0);

    // 검색
    const [searchKeyword, setSearchKeyword] = useState('');

    // 필수 컬럼 매핑
    const [columnMapping, setColumnMapping] = useState({
        세목: '',
        코스트센터: '',
        공급업체: '',
        금액: '',
        타겟: '',
    });

    // 선택 상태
    const [selectedDeleteColumns, setSelectedDeleteColumns] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        const session = getSessionInfo();
        setSessionInfo(session);

        const { rawData, processData, totalRows, columns } = getFileLoadData();
        setRawData(rawData);
        setProcessData(processData);
        setTotalRows(totalRows);

        setDeleteColumns(getDeleteColumnList());
        setStandardList(getStandardList());
    };

    // 페이지 변경
    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    const handlePageSizeChange = (size) => {
        setPageSize(size);
        setCurrentPage(1);
    };

    // 탭 변경
    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    // 컬럼 매핑 변경
    const handleColumnMappingChange = (field, value) => {
        setColumnMapping(prev => ({ ...prev, [field]: value }));
    };

    // 완료 버튼
    const handleComplete = () => {
        alert('파일 로드 완료! 전처리 화면으로 이동합니다.');
        navigate(`/projects/${projectId}/sessions/${sessionId}/preprocessing`);
    };

    // 원본 테이블 컬럼
    const rawDataColumns = [
        { field: 'id', headerName: 'No', width: 70 },
        { field: '날짜', headerName: '날짜', width: 120 },
        { field: '세목', headerName: '세목', width: 120 },
        { field: '코스트센터', headerName: '코스트센터', width: 150 },
        { field: '공급업체', headerName: '공급업체', width: 150 },
        { 
            field: '금액', 
            headerName: '금액', 
            width: 150,
            valueFormatter: (params) => formatNumber(params.value),
        },
        { field: '적요', headerName: '적요', flex: 1, minWidth: 200 },
    ];

    // 처리 테이블 컬럼
    const processDataColumns = [
        { field: 'id', headerName: 'No', width: 70 },
        { field: '날짜', headerName: '날짜', width: 120 },
        { field: '세목', headerName: '세목', width: 120 },
        { field: '코스트센터_정제', headerName: '코스트센터', width: 150 },
        { field: '공급업체_정제', headerName: '공급업체', width: 150 },
        { 
            field: '금액', 
            headerName: '금액', 
            width: 150,
            valueFormatter: (params) => formatNumber(params.value),
        },
        { field: '키워드', headerName: '키워드', flex: 1, minWidth: 150 },
    ];

    // 삭제 컬럼 테이블 컬럼
    const deleteColumnColumns = [
        {
            field: 'selected',
            headerName: '선택',
            width: 80,
            renderCell: (params) => (
                <Checkbox
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
        { field: 'original', headerName: '원본', flex: 1 },
        { field: 'standard', headerName: '표준', flex: 1 },
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
                {/* 좌측 영역 (72%) */}
                <Grid item xs={12} md={8.5}>
                    <Box className={styles.leftPanel}>
                        {/* 원본 데이터 테이블 */}
                        <Paper className={styles.tableSection}>
                            <StyledDataGrid
                                title="원본 테이블"
                                rows={rawData}
                                columns={rawDataColumns}
                                height="350px"
                            />
                        </Paper>

                        {/* 처리 데이터 테이블 */}
                        <Paper className={styles.tableSection}>
                            <StyledDataGrid
                                title="처리 테이블"
                                rows={processData}
                                columns={processDataColumns}
                                height="350px"
                            />
                        </Paper>

                        {/* 페이지네이션 */}
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalRows={totalRows}
                            pageSize={pageSize}
                            onPageChange={handlePageChange}
                            onPageSizeChange={handlePageSizeChange}
                        />
                    </Box>
                </Grid>

                {/* 우측 영역 (28%) */}
                <Grid item xs={12} md={3.5}>
                    <Box className={styles.rightPanel}>
                        {/* 탭 컨트롤 */}
                        <Paper className={styles.tabSection}>
                            <Tabs
                                value={activeTab}
                                onChange={handleTabChange}
                                variant="fullWidth"
                            >
                                <Tab label="제거 열 설정" />
                                <Tab label="데이터 삭제" />
                            </Tabs>

                            <Box className={styles.tabContent}>
                                {activeTab === 0 && (
                                    <Box>
                                        <StyledDataGrid
                                            rows={deleteColumns}
                                            columns={deleteColumnColumns}
                                            height="200px"
                                            checkboxSelection={false}
                                        />
                                    </Box>
                                )}
                                {activeTab === 1 && (
                                    <Box>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            placeholder="검색어 입력..."
                                            value={searchKeyword}
                                            onChange={(e) => setSearchKeyword(e.target.value)}
                                            className={styles.searchInput}
                                        />
                                        <StyledDataGrid
                                            rows={deleteData}
                                            columns={[
                                                { field: 'id', headerName: 'No', width: 70 },
                                                { field: 'data', headerName: '데이터', flex: 1 },
                                            ]}
                                            height="160px"
                                            checkboxSelection
                                        />
                                    </Box>
                                )}
                            </Box>
                        </Paper>

                        {/* 표준화 설정 */}
                        <StyledGroupBox
                            title="코스트센터/공급업체 명 표준화"
                            warningText="원본 데이터의 표기를 표준화합니다."
                        >
                            <StyledDataGrid
                                rows={standardList}
                                columns={standardColumns}
                                height="150px"
                            />
                        </StyledGroupBox>

                        {/* 필수 항목 설정 */}
                        <StyledGroupBox
                            title="필수 항목 설정"
                            warningText="각 컬럼을 매핑해주세요."
                        >
                            <Box className={styles.mappingForm}>
                                {['세목', '코스트센터', '공급업체', '금액', '타겟'].map((field) => (
                                    <Box key={field} className={styles.mappingRow}>
                                        <Typography className={styles.mappingLabel}>
                                            {field}
                                        </Typography>
                                        <Select
                                            size="small"
                                            value={columnMapping[field]}
                                            onChange={(e) => handleColumnMappingChange(field, e.target.value)}
                                            className={styles.mappingSelect}
                                            displayEmpty
                                        >
                                            <MenuItem value="">선택...</MenuItem>
                                            <MenuItem value="날짜">날짜</MenuItem>
                                            <MenuItem value="세목">세목</MenuItem>
                                            <MenuItem value="코스트센터">코스트센터</MenuItem>
                                            <MenuItem value="공급업체">공급업체</MenuItem>
                                            <MenuItem value="금액">금액</MenuItem>
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
                                완료
                            </ActionButton>
                        </Box>
                    </Box>
                </Grid>
            </Grid>
        </Container>
    );
}

export default FileLoadPage;
