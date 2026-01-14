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
    FormControl,
    InputLabel,
} from '@mui/material';

import {
    SessionHeader,
    Pagination,
    StyledGroupBox,
    StyledDataGrid,
    ActionButton,
} from '../../components/common';

import {
    getDataTransformData,
    getKeywordSummary,
    getMatchKeywords,
    getSessionInfo,
} from '../../services/mockDataService';

import { formatNumber, formatCurrency } from '../../utils/formatters';
import styles from './DataTransformPage.module.css';

function DataTransformPage() {
    const { projectId, sessionId } = useParams();
    const navigate = useNavigate();

    // 세션 정보
    const [sessionInfo, setSessionInfo] = useState(null);

    // 데이터
    const [originalData, setOriginalData] = useState([]);
    const [transformData, setTransformData] = useState([]);
    const [keywordSummary, setKeywordSummary] = useState([]);
    const [matchKeywords, setMatchKeywords] = useState([]);

    // 페이지네이션 (원본)
    const [originalPage, setOriginalPage] = useState(1);
    const [originalPageSize, setOriginalPageSize] = useState(1000);
    const [originalTotalRows, setOriginalTotalRows] = useState(0);

    // 페이지네이션 (변환)
    const [transformPage, setTransformPage] = useState(1);
    const [transformPageSize, setTransformPageSize] = useState(1000);
    const [transformTotalRows, setTransformTotalRows] = useState(0);

    // 금액 단위
    const [amountUnit, setAmountUnit] = useState('원');

    // 검색/수정
    const [searchKeyword, setSearchKeyword] = useState('');
    const [modifyKeyword, setModifyKeyword] = useState('');

    // 클러스터 설정
    const [clusterCount, setClusterCount] = useState(5);

    // 선택 상태
    const [selectedMatchKeywords, setSelectedMatchKeywords] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        const session = getSessionInfo();
        setSessionInfo(session);

        const { originalData, transformData } = getDataTransformData();
        setOriginalData(originalData);
        setTransformData(transformData);
        setOriginalTotalRows(5000);
        setTransformTotalRows(4500);

        setKeywordSummary(getKeywordSummary());
        setMatchKeywords(getMatchKeywords());
    };

    // 키워드 검색
    const handleSearch = () => {
        alert(`"${searchKeyword}" 검색 실행`);
    };

    // 키워드 수정
    const handleModify = () => {
        if (selectedMatchKeywords.length > 0 && modifyKeyword.trim()) {
            alert(`선택된 키워드를 "${modifyKeyword}"로 수정`);
        }
    };

    // 완료 버튼
    const handleComplete = () => {
        alert('데이터 변환 완료! 클러스터링 화면으로 이동합니다.');
        navigate(`/projects/${projectId}/sessions/${sessionId}/clustering`);
    };

    // 원본 키워드 테이블 컬럼
    const originalColumns = [
        { field: 'id', headerName: 'No', width: 70 },
        { field: '키워드', headerName: '키워드', flex: 1, minWidth: 150 },
        { field: '건수', headerName: '건수', width: 100, valueFormatter: (params) => formatNumber(params.value) },
        { field: '금액합계', headerName: '금액 합계', width: 150, valueFormatter: (params) => formatCurrency(params.value, amountUnit) },
    ];

    // 변환 키워드 테이블 컬럼
    const transformColumns = [
        { field: 'id', headerName: 'No', width: 70 },
        { field: '변환키워드', headerName: '변환 키워드', flex: 1, minWidth: 150 },
        { field: '건수', headerName: '건수', width: 100, valueFormatter: (params) => formatNumber(params.value) },
        { field: '금액합계', headerName: '금액 합계', width: 150, valueFormatter: (params) => formatCurrency(params.value, amountUnit) },
    ];

    // 키워드 요약 테이블 컬럼
    const summaryColumns = [
        { field: 'keyword', headerName: '키워드', flex: 1 },
        { field: 'count', headerName: '건수', width: 80, valueFormatter: (params) => formatNumber(params.value) },
        { field: 'amount', headerName: '금액', width: 120, valueFormatter: (params) => formatCurrency(params.value, amountUnit) },
    ];

    // 키워드 매칭 테이블 컬럼
    const matchColumns = [
        { field: 'keyword', headerName: '키워드', flex: 1 },
        { field: 'matchKeyword', headerName: '매칭 키워드', flex: 1 },
    ];

    const originalTotalPages = Math.ceil(originalTotalRows / originalPageSize);
    const transformTotalPages = Math.ceil(transformTotalRows / transformPageSize);

    return (
        <Container maxWidth={false} className={styles.container}>
            {/* 세션 헤더 */}
            <Box className={styles.sessionHeader}>
                <SessionHeader sessionName={sessionInfo?.sessionName} />
            </Box>

            {/* 메인 콘텐츠 */}
            <Grid container spacing={2} className={styles.mainContent}>
                {/* 좌측 영역 (60%) */}
                <Grid item xs={12} md={7}>
                    <Box className={styles.leftPanel}>
                        {/* 원본 키워드 데이터 */}
                        <Box className={styles.tableSection}>
                            <Typography variant="subtitle1" className={styles.sectionTitle}>
                                원본 키워드 데이터
                            </Typography>
                            <StyledDataGrid
                                rows={originalData}
                                columns={originalColumns}
                                height="280px"
                            />
                            <Pagination
                                currentPage={originalPage}
                                totalPages={originalTotalPages}
                                totalRows={originalTotalRows}
                                pageSize={originalPageSize}
                                onPageChange={setOriginalPage}
                                onPageSizeChange={(size) => {
                                    setOriginalPageSize(size);
                                    setOriginalPage(1);
                                }}
                            />
                        </Box>

                        {/* 변환 키워드 데이터 */}
                        <Box className={styles.tableSection}>
                            <Typography variant="subtitle1" className={styles.sectionTitle}>
                                변환 키워드 데이터
                            </Typography>
                            <StyledDataGrid
                                rows={transformData}
                                columns={transformColumns}
                                height="280px"
                            />
                            <Pagination
                                currentPage={transformPage}
                                totalPages={transformTotalPages}
                                totalRows={transformTotalRows}
                                pageSize={transformPageSize}
                                onPageChange={setTransformPage}
                                onPageSizeChange={(size) => {
                                    setTransformPageSize(size);
                                    setTransformPage(1);
                                }}
                            />
                        </Box>
                    </Box>
                </Grid>

                {/* 우측 영역 (40%) */}
                <Grid item xs={12} md={5}>
                    <Box className={styles.rightPanel}>
                        {/* 키워드 요약 */}
                        <StyledGroupBox
                            title="키워드 요약"
                            warningText="금액 단위를 선택하여 표시합니다."
                            sx={{ flex: '0 0 42%' }}
                        >
                            <Box className={styles.unitSelector}>
                                <Typography className={styles.unitLabel}>금액 단위:</Typography>
                                <Select
                                    size="small"
                                    value={amountUnit}
                                    onChange={(e) => setAmountUnit(e.target.value)}
                                    className={styles.unitSelect}
                                >
                                    <MenuItem value="원">원</MenuItem>
                                    <MenuItem value="천원">천원</MenuItem>
                                    <MenuItem value="백만원">백만원</MenuItem>
                                    <MenuItem value="억원">억원</MenuItem>
                                </Select>
                            </Box>
                            <StyledDataGrid
                                rows={keywordSummary}
                                columns={summaryColumns}
                                height="200px"
                            />
                        </StyledGroupBox>

                        {/* 키워드 변환 */}
                        <StyledGroupBox
                            title="키워드 변환"
                            warningText="선택한 키워드를 일괄 변환합니다."
                            sx={{ flex: '0 0 47%' }}
                        >
                            <Box className={styles.searchRow}>
                                <TextField
                                    size="small"
                                    placeholder="검색 키워드"
                                    value={searchKeyword}
                                    onChange={(e) => setSearchKeyword(e.target.value)}
                                    className={styles.searchField}
                                />
                                <ActionButton variant="search" size="small" onClick={handleSearch}>
                                    검색
                                </ActionButton>
                            </Box>
                            <StyledDataGrid
                                rows={matchKeywords}
                                columns={matchColumns}
                                height="120px"
                                checkboxSelection
                                onSelectionChange={(ids) => setSelectedMatchKeywords(ids)}
                                selectionModel={selectedMatchKeywords}
                            />
                            <Box className={styles.modifyRow}>
                                <TextField
                                    size="small"
                                    placeholder="변환할 키워드"
                                    value={modifyKeyword}
                                    onChange={(e) => setModifyKeyword(e.target.value)}
                                    className={styles.modifyField}
                                />
                                <ActionButton variant="apply" size="small" onClick={handleModify}>
                                    수정
                                </ActionButton>
                            </Box>
                        </StyledGroupBox>

                        {/* Cluster 설정 */}
                        <StyledGroupBox
                            title="Cluster 설정"
                            sx={{ flex: '0 0 10%' }}
                        >
                            <Box className={styles.clusterRow}>
                                <Typography className={styles.clusterLabel}>
                                    Cluster 개수:
                                </Typography>
                                <TextField
                                    type="number"
                                    size="small"
                                    value={clusterCount}
                                    onChange={(e) => setClusterCount(parseInt(e.target.value, 10) || 5)}
                                    inputProps={{ min: 2, max: 20 }}
                                    className={styles.clusterInput}
                                />
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

export default DataTransformPage;
