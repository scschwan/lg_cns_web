// frontend/src/pages/clustering/ClusteringPage.jsx

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
    Tabs,
    Tab,
} from '@mui/material';

import {
    SessionHeader,
    Pagination,
    StyledGroupBox,
    StyledDataGrid,
    ActionButton,
} from '../../components/common';

import {
    getClusteringData,
    getClusterSummary,
    getSupplierSummary,
    getRecommendKeywords,
    getLv1List,
    getSessionInfo,
} from '../../services/mockDataService';

import { formatNumber, formatCurrency } from '../../utils/formatters';
import styles from './ClusteringPage.module.css';

function ClusteringPage() {
    const { projectId, sessionId } = useParams();
    const navigate = useNavigate();

    // 세션 정보
    const [sessionInfo, setSessionInfo] = useState(null);

    // 데이터
    const [mergeClusterData, setMergeClusterData] = useState([]);
    const [modifiedData, setModifiedData] = useState([]);
    const [supplierSummary, setSupplierSummary] = useState([]);
    const [recommendKeywords, setRecommendKeywords] = useState([]);
    const [lv1List, setLv1List] = useState([]);
    const [clusterSummary, setClusterSummary] = useState({});

    // 페이지네이션
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(1000);
    const [totalRows, setTotalRows] = useState(0);

    // 검색/필터
    const [searchColumn, setSearchColumn] = useState('키워드');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [exceptionKeyword, setExceptionKeyword] = useState('');
    const [exactMatch, setExactMatch] = useState(false);
    const [excludeItems, setExcludeItems] = useState(false);
    const [searchInResults, setSearchInResults] = useState(false);

    // 탭 상태
    const [activeTab, setActiveTab] = useState(0);

    // 선택 상태
    const [selectedClusters, setSelectedClusters] = useState([]);
    const [selectedLv1, setSelectedLv1] = useState([]);
    const [selectedRecommend, setSelectedRecommend] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        const session = getSessionInfo();
        setSessionInfo(session);

        const { mergeClusterData, modifiedData } = getClusteringData();
        setMergeClusterData(mergeClusterData);
        setModifiedData(modifiedData);
        setTotalRows(15000);

        setClusterSummary(getClusterSummary());
        setSupplierSummary(getSupplierSummary());
        setRecommendKeywords(getRecommendKeywords());
        setLv1List(getLv1List());
    };

    // 검색
    const handleSearch = () => {
        alert(`"${searchKeyword}" 검색 (컬럼: ${searchColumn})`);
    };

    // 전체 선택
    const handleSelectAll = () => {
        const allIds = mergeClusterData.map(item => item.id);
        setSelectedClusters(allIds);
    };

    // 병합
    const handleMerge = () => {
        if (selectedClusters.length < 2) {
            alert('2개 이상의 클러스터를 선택해주세요.');
            return;
        }
        alert(`${selectedClusters.length}개 클러스터 병합`);
    };

    // 추가 병합
    const handleAdditionalMerge = () => {
        alert('추가 병합 실행');
    };

    // 완료 버튼
    const handleComplete = () => {
        alert('클러스터링 완료! Export 화면으로 이동합니다.');
        navigate(`/projects/${projectId}/sessions/${sessionId}/export`);
    };

    // 클러스터 테이블 컬럼
    const clusterColumns = [
        { field: 'clusterId', headerName: 'ID', width: 60 },
        { field: 'clusterName', headerName: '클러스터명', flex: 1, minWidth: 150 },
        { field: 'keywordCount', headerName: '키워드 수', width: 100 },
        { 
            field: 'totalAmount', 
            headerName: '금액 합계', 
            width: 150,
            valueFormatter: (params) => formatCurrency(params.value, '원'),
        },
    ];

    // 수정 데이터 테이블 컬럼
    const modifiedColumns = [
        { field: 'id', headerName: 'No', width: 70 },
        { field: '키워드', headerName: '키워드', flex: 1, minWidth: 150 },
        { field: '코스트센터', headerName: '코스트센터', width: 120 },
        { field: '공급업체', headerName: '공급업체', width: 150 },
        { 
            field: '금액', 
            headerName: '금액', 
            width: 130,
            valueFormatter: (params) => formatNumber(params.value),
        },
        { field: 'clusterId', headerName: '클러스터', width: 80 },
    ];

    // 공급업체 요약 컬럼
    const supplierColumns = [
        { field: 'supplier', headerName: '공급업체', flex: 1 },
        { field: 'count', headerName: '건수', width: 80 },
        { field: 'amount', headerName: '금액', width: 120, valueFormatter: (params) => formatCurrency(params.value, '원') },
    ];

    // 추천 키워드 컬럼
    const recommendColumns = [
        { field: 'keyword', headerName: '키워드', flex: 1 },
        { field: 'score', headerName: '유사도', width: 80, valueFormatter: (params) => (params.value * 100).toFixed(0) + '%' },
    ];

    // Lv1 컬럼
    const lv1Columns = [
        { field: 'lv1Name', headerName: 'Lv1 분류', flex: 1 },
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
                {/* 좌측 영역 (65%) */}
                <Grid item xs={12} md={7.5}>
                    <Box className={styles.leftPanel}>
                        {/* 검색/필터 영역 */}
                        <Box className={styles.searchSection}>
                            <Grid container spacing={1} alignItems="center">
                                <Grid item xs={2}>
                                    <Select
                                        size="small"
                                        value={searchColumn}
                                        onChange={(e) => setSearchColumn(e.target.value)}
                                        fullWidth
                                    >
                                        <MenuItem value="키워드">키워드</MenuItem>
                                        <MenuItem value="코스트센터">코스트센터</MenuItem>
                                        <MenuItem value="공급업체">공급업체</MenuItem>
                                    </Select>
                                </Grid>
                                <Grid item xs={3}>
                                    <TextField
                                        size="small"
                                        placeholder="검색어 입력"
                                        value={searchKeyword}
                                        onChange={(e) => setSearchKeyword(e.target.value)}
                                        fullWidth
                                    />
                                </Grid>
                                <Grid item xs={2}>
                                    <TextField
                                        size="small"
                                        placeholder="제외 키워드"
                                        value={exceptionKeyword}
                                        onChange={(e) => setExceptionKeyword(e.target.value)}
                                        fullWidth
                                    />
                                </Grid>
                                <Grid item xs={1}>
                                    <ActionButton variant="search" size="small" onClick={handleSearch}>
                                        검색
                                    </ActionButton>
                                </Grid>
                                <Grid item xs={4}>
                                    <Box className={styles.checkboxGroup}>
                                        <FormControlLabel
                                            control={<Checkbox size="small" checked={exactMatch} onChange={(e) => setExactMatch(e.target.checked)} />}
                                            label="완전일치"
                                        />
                                        <FormControlLabel
                                            control={<Checkbox size="small" checked={excludeItems} onChange={(e) => setExcludeItems(e.target.checked)} />}
                                            label="제외항목"
                                        />
                                        <FormControlLabel
                                            control={<Checkbox size="small" checked={searchInResults} onChange={(e) => setSearchInResults(e.target.checked)} />}
                                            label="결과내검색"
                                        />
                                    </Box>
                                </Grid>
                            </Grid>
                        </Box>

                        {/* 병합 버튼 영역 */}
                        <Box className={styles.mergeSection}>
                            <ActionButton variant="apply" size="small" onClick={handleSelectAll}>
                                전체 선택
                            </ActionButton>
                            <ActionButton variant="merge" size="small" onClick={handleMerge}>
                                병합
                            </ActionButton>
                            <ActionButton variant="add" size="small" onClick={handleAdditionalMerge}>
                                추가 병합
                            </ActionButton>
                            <Box className={styles.summaryInfo}>
                                <Typography className={styles.summaryText}>
                                    행 수: {formatNumber(clusterSummary.totalRows)}
                                </Typography>
                                <Typography className={styles.summaryText}>
                                    미병합 Cluster: {clusterSummary.unmergedClusters}
                                </Typography>
                                <Typography className={styles.summaryText}>
                                    미병합 합산금액: {formatCurrency(clusterSummary.unmergedAmount, '원')}
                                </Typography>
                            </Box>
                        </Box>

                        {/* 탭 영역 */}
                        <Tabs
                            value={activeTab}
                            onChange={(e, v) => setActiveTab(v)}
                            className={styles.tabs}
                        >
                            <Tab label="키워드별" />
                            <Tab label="공급업체별" />
                        </Tabs>

                        {/* 데이터 테이블 */}
                        <Box className={styles.tableSection}>
                            {activeTab === 0 ? (
                                <StyledDataGrid
                                    rows={mergeClusterData}
                                    columns={clusterColumns}
                                    height="calc(100vh - 450px)"
                                    checkboxSelection
                                    onSelectionChange={(ids) => setSelectedClusters(ids)}
                                    selectionModel={selectedClusters}
                                />
                            ) : (
                                <StyledDataGrid
                                    rows={supplierSummary}
                                    columns={supplierColumns}
                                    height="calc(100vh - 450px)"
                                />
                            )}
                        </Box>

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

                {/* 우측 영역 (35%) */}
                <Grid item xs={12} md={4.5}>
                    <Box className={styles.rightPanel}>
                        {/* Lv1 선택 */}
                        <StyledGroupBox
                            title="Lv1 선택"
                            warningText="상위 분류를 선택합니다."
                            sx={{ flex: '0 0 30%' }}
                        >
                            <StyledDataGrid
                                rows={lv1List}
                                columns={lv1Columns}
                                height="150px"
                                checkboxSelection
                                onSelectionChange={(ids) => setSelectedLv1(ids)}
                                selectionModel={selectedLv1}
                            />
                        </StyledGroupBox>

                        {/* 추천 키워드 선택 */}
                        <StyledGroupBox
                            title="추천 키워드 선택"
                            warningText="유사 키워드를 추천합니다."
                            sx={{ flex: '0 0 25%' }}
                        >
                            <StyledDataGrid
                                rows={recommendKeywords}
                                columns={recommendColumns}
                                height="120px"
                                checkboxSelection
                                onSelectionChange={(ids) => setSelectedRecommend(ids)}
                                selectionModel={selectedRecommend}
                            />
                        </StyledGroupBox>

                        {/* Clustering 병합 결과 확인 */}
                        <StyledGroupBox
                            title="Clustering 병합 결과 확인"
                            warningText="병합된 클러스터 내역을 확인합니다."
                            sx={{ flex: '0 0 35%' }}
                        >
                            <StyledDataGrid
                                rows={modifiedData.slice(0, 10)}
                                columns={[
                                    { field: '키워드', headerName: '키워드', flex: 1 },
                                    { field: 'clusterId', headerName: '클러스터', width: 80 },
                                ]}
                                height="180px"
                            />
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

export default ClusteringPage;
