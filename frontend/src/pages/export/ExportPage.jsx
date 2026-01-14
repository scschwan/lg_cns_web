// frontend/src/pages/export/ExportPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    Grid,
    Typography,
    Checkbox,
} from '@mui/material';

import {
    SessionHeader,
    Pagination,
    StyledGroupBox,
    StyledDataGrid,
    ActionButton,
} from '../../components/common';

import {
    getExportData,
    getClusteringResults,
    getExportColumnList,
    getSessionInfo,
} from '../../services/mockDataService';

import { formatNumber, formatCurrency } from '../../utils/formatters';
import styles from './ExportPage.module.css';

function ExportPage() {
    const { projectId, sessionId } = useParams();
    const navigate = useNavigate();

    // 세션 정보
    const [sessionInfo, setSessionInfo] = useState(null);

    // 데이터
    const [originData, setOriginData] = useState([]);
    const [keywordData, setKeywordData] = useState([]);
    const [clusteringResults, setClusteringResults] = useState([]);
    const [exportColumns, setExportColumns] = useState([]);

    // 페이지네이션
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(1000);
    const [totalRows, setTotalRows] = useState(0);

    // 선택 상태
    const [selectedClusters, setSelectedClusters] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        const session = getSessionInfo();
        setSessionInfo(session);

        const { originData, keywordData } = getExportData();
        setOriginData(originData);
        setKeywordData(keywordData);
        setTotalRows(15000);

        setClusteringResults(getClusteringResults());
        setExportColumns(getExportColumnList());
    };

    // 클러스터명 변경
    const handleClusterNameChange = (id, newName) => {
        const updated = clusteringResults.map(cluster =>
            cluster.id === id
                ? { ...cluster, clusterName: newName }
                : cluster
        );
        setClusteringResults(updated);
    };

    // 컬럼 선택 변경
    const handleColumnSelectChange = (id, selected) => {
        const updated = exportColumns.map(col =>
            col.id === id
                ? { ...col, selected }
                : col
        );
        setExportColumns(updated);
    };

    // 세부 클러스터링
    const handleDetailClustering = () => {
        if (selectedClusters.length === 0) {
            alert('세부 클러스터링할 클러스터를 선택해주세요.');
            return;
        }
        alert(`선택된 클러스터: ${selectedClusters.join(', ')} - 세부 클러스터링 실행`);
    };

    // Excel 저장 (완료)
    const handleExportExcel = () => {
        const selectedColumnNames = exportColumns
            .filter(col => col.selected)
            .map(col => col.columnName);

        if (selectedColumnNames.length === 0) {
            alert('내보낼 열을 선택해주세요.');
            return;
        }

        alert(`Excel 저장 완료!\n선택된 열: ${selectedColumnNames.join(', ')}\n세션이 완료되었습니다.`);
        
        // 세션 완료 후 프로젝트 대시보드로 이동
        navigate(`/projects/${projectId}`);
    };

    // 원본 테이블 컬럼
    const originColumns = [
        { field: 'id', headerName: 'No', width: 70 },
        { field: '날짜', headerName: '날짜', width: 110 },
        { field: '세목', headerName: '세목', width: 100 },
        { field: '코스트센터', headerName: '코스트센터', width: 130 },
        { field: '공급업체', headerName: '공급업체', width: 150 },
        { 
            field: '금액', 
            headerName: '금액', 
            width: 130,
            valueFormatter: (params) => formatNumber(params.value),
        },
        { field: '클러스터명', headerName: '클러스터명', flex: 1, minWidth: 150 },
    ];

    // 키워드 테이블 컬럼
    const keywordColumns = [
        { field: 'id', headerName: 'No', width: 70 },
        { field: '키워드', headerName: '키워드', flex: 1, minWidth: 150 },
        { field: '건수', headerName: '건수', width: 80, valueFormatter: (params) => formatNumber(params.value) },
        { 
            field: '금액합계', 
            headerName: '금액 합계', 
            width: 130,
            valueFormatter: (params) => formatCurrency(params.value, '원'),
        },
        { field: '클러스터명', headerName: '클러스터명', width: 150 },
    ];

    // 클러스터링 결과 컬럼 (편집 가능)
    const clusterResultColumns = [
        { field: 'clusterId', headerName: 'ID', width: 60 },
        { 
            field: 'clusterName', 
            headerName: '클러스터명', 
            flex: 1,
            editable: true,
            renderCell: (params) => (
                <Typography
                    sx={{
                        fontFamily: 'Pretendard, sans-serif',
                        fontSize: '13px',
                        cursor: 'pointer',
                        '&:hover': { textDecoration: 'underline' },
                    }}
                    onClick={() => {
                        const newName = prompt('새 클러스터명 입력:', params.value);
                        if (newName !== null) {
                            handleClusterNameChange(params.row.id, newName);
                        }
                    }}
                >
                    {params.value}
                </Typography>
            ),
        },
        { field: 'recordCount', headerName: '건수', width: 80, valueFormatter: (params) => formatNumber(params.value) },
        { 
            field: 'totalAmount', 
            headerName: '금액', 
            width: 120,
            valueFormatter: (params) => formatCurrency(params.value, '원'),
        },
    ];

    // 제거 열 설정 컬럼
    const exportColumnColumns = [
        {
            field: 'selected',
            headerName: '선택',
            width: 70,
            renderCell: (params) => (
                <Checkbox
                    checked={params.value}
                    onChange={(e) => handleColumnSelectChange(params.row.id, e.target.checked)}
                />
            ),
        },
        { field: 'columnName', headerName: '열 이름', flex: 1 },
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
                {/* 좌측 영역 */}
                <Grid item xs={12} md={8}>
                    <Box className={styles.leftPanel}>
                        {/* 원본 테이블 */}
                        <Box className={styles.tableSection}>
                            <Typography variant="subtitle1" className={styles.sectionTitle}>
                                원본 테이블
                            </Typography>
                            <StyledDataGrid
                                rows={originData}
                                columns={originColumns}
                                height="280px"
                            />
                        </Box>

                        {/* Export 결과 */}
                        <Box className={styles.tableSection}>
                            <Typography variant="subtitle1" className={styles.sectionTitle}>
                                Export 결과
                            </Typography>
                            <StyledDataGrid
                                rows={keywordData}
                                columns={keywordColumns}
                                height="280px"
                            />
                        </Box>

                        {/* 페이지네이션 + Excel 저장 버튼 */}
                        <Box className={styles.paginationSection}>
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
                            <ActionButton
                                variant="complete"
                                size="large"
                                onClick={handleExportExcel}
                                sx={{ minWidth: '150px' }}
                            >
                                Excel 저장
                            </ActionButton>
                        </Box>
                    </Box>
                </Grid>

                {/* 우측 영역 (500px 고정) */}
                <Grid item xs={12} md={4}>
                    <Box className={styles.rightPanel}>
                        {/* Clustering 결과 */}
                        <StyledGroupBox
                            title="Clustering 결과"
                            warningText="클러스터명을 클릭하여 수정할 수 있습니다."
                            warningText2="우클릭으로 세부 클러스터링을 실행합니다."
                            sx={{ flex: '0 0 65%' }}
                        >
                            <StyledDataGrid
                                rows={clusteringResults}
                                columns={clusterResultColumns}
                                height="280px"
                                checkboxSelection
                                onSelectionChange={(ids) => setSelectedClusters(ids)}
                                selectionModel={selectedClusters}
                            />
                            <Box className={styles.buttonRow}>
                                <ActionButton
                                    variant="merge"
                                    size="small"
                                    onClick={handleDetailClustering}
                                >
                                    세부 클러스터링
                                </ActionButton>
                            </Box>
                        </StyledGroupBox>

                        {/* 제거 열 설정 */}
                        <StyledGroupBox
                            title="제거 열 설정"
                            warningText="선택된 열만 Excel에 포함됩니다."
                            sx={{ flex: '0 0 35%' }}
                        >
                            <StyledDataGrid
                                rows={exportColumns}
                                columns={exportColumnColumns}
                                height="180px"
                            />
                        </StyledGroupBox>
                    </Box>
                </Grid>
            </Grid>
        </Container>
    );
}

export default ExportPage;
