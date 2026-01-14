// frontend/src/pages/clustering/DetailClusteringPage.jsx

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

import { formatNumber, formatCurrency } from '../../utils/formatters';
import styles from './DetailClusteringPage.module.css';

// Mock Data - 키워드별 요약
const generateKeywordSummary = () => [
    { id: 1, keyword: '(주)에스엘프로바이더', count: 1401, amount: 9009392654, selected: true },
    { id: 2, keyword: '(주)디앤에스', count: 1295, amount: 1589052290, selected: false },
    { id: 3, keyword: '물류수수료', count: 1046, amount: 4115769209, selected: false },
    { id: 4, keyword: '아웃소싱수수료', count: 878, amount: 7954918617, selected: false },
    { id: 5, keyword: '항만초도분배비용', count: 505, amount: 765694105, selected: false },
    { id: 6, keyword: '주식회사 아펙스로...', count: 372, amount: 306545537, selected: false },
];

// Mock Data - 공급업체별 요약
const generateSupplierSummary = () => [
    { id: 1, supplier: '(주)에스엘프로바이더', count: 1401, amount: 9009392654, selected: false },
    { id: 2, supplier: '(주)디앤에스', count: 1295, amount: 1589052290, selected: false },
    { id: 3, supplier: '주식회사 아펙스로...', count: 878, amount: 7954918617, selected: false },
    { id: 4, supplier: '(주)인타임', count: 342, amount: 3151154072, selected: false },
    { id: 5, supplier: '(주)코로넷', count: 273, amount: 117189546, selected: false },
    { id: 6, supplier: '태운', count: 265, amount: 3578985357, selected: false },
];

// Mock Data - 미병합 클러스터 목록
const generateClusterList = () => [
    { id: 1, clusterName: '(주) 코로넷_레이디브랜_물류 레이디브랜_아웃소싱수수료', keywordList: '(주) 코로넷,레...', count: 1, amount: 200, year: '2019', segment: '8101', date: '43775', docNo: '133901120', selected: false },
    { id: 2, clusterName: '(주)이피케이얼_나우셩_물류수수로_E전용상품 나우셩', keywordList: '(주)이피케이얼...', count: 1, amount: 10000000, year: '2019', segment: '7601', date: '43521', docNo: '134290065', selected: false },
    { id: 3, clusterName: '(주)이피케이얼_모던_물류수수료_E 입점 모던하우스', keywordList: '(주)이피케이얼...', count: 1, amount: 139701012, year: '2019', segment: '7601', date: '43521', docNo: '134290065', selected: false },
    { id: 4, clusterName: '(주)이피케이얼_물류수수료_유통패션_E 유통 의류', keywordList: '(주)이피케이얼...', count: 1, amount: 154080988, year: '2019', segment: '7601', date: '43521', docNo: '134290064', selected: false },
    { id: 5, clusterName: '(주)이피케이얼_유통패션_이커머스물류수수료_E 유통 외류', keywordList: '(주)이피케이얼...', count: 1, amount: 160157590, year: '2019', segment: '7601', date: '43489', docNo: '133900794', selected: false },
    { id: 6, clusterName: '(주)이피케이얼_모던_이커머스물류수수료_E 입점 모던하우스', keywordList: '(주)이피케이얼...', count: 1, amount: 175176219, year: '2019', segment: '7601', date: '43489', docNo: '133900793', selected: false },
    { id: 7, clusterName: '(주)인터김_근지암물류비_원트키즈_판관_HK', keywordList: '(주)인터김,근지...', count: 2, amount: 2572202, year: '2019', segment: '8000', date: '43774', docNo: '137982532', selected: false },
    { id: 8, clusterName: '(주)인터김_본부 해외카주얼가방_수수료_스틱_아웃소싱_인터김_카주얼', keywordList: '(주)인터김,본부...', count: 6, amount: 933360, year: '2019', segment: '8000', date: '43650', docNo: '136268935', selected: false },
    { id: 9, clusterName: '(주)인터김_본부 해외카주얼_수수료_스탁_아웃소싱_인터김_카주얼', keywordList: '(주)인터김,본부...', count: 8, amount: 27636510, year: '2019', segment: '8000', date: '43650', docNo: '136268935', selected: false },
    { id: 10, clusterName: '(주)인터김_본부_해외카주얼가방_아웃소싱수수료_해외카주얼가방', keywordList: '(주)인터김,본부...', count: 1, amount: 203200, year: '2019', segment: '8000', date: '43626', docNo: '135903800', selected: false },
    { id: 11, clusterName: '(주) 코로넷_레이디브랜_물류 레이디브랜_아웃소싱수수료', keywordList: '(주) 코로넷,레...', count: 1, amount: 200, year: '2019', segment: '8101', date: '43775', docNo: '133901120', selected: false },
    { id: 12, clusterName: '(주)이피케이얼_나우셩_물류수수로_E전용상품 나우셩', keywordList: '(주)이피케이얼...', count: 1, amount: 10000000, year: '2019', segment: '7601', date: '43521', docNo: '134290065', selected: false },
    { id: 13, clusterName: '(주)이피케이얼_모던_물류수수료_E 입점 모던하우스', keywordList: '(주)이피케이얼...', count: 1, amount: 139701012, year: '2019', segment: '7601', date: '43521', docNo: '134290065', selected: false },
    { id: 14, clusterName: '(주)이피케이얼_물류수수료_유통패션_E 유통 의류', keywordList: '(주)이피케이얼...', count: 1, amount: 154080988, year: '2019', segment: '7601', date: '43521', docNo: '134290064', selected: false },
    { id: 15, clusterName: '(주)이피케이얼_유통패션_이커머스물류수수료_E 유통 외류', keywordList: '(주)이피케이얼...', count: 1, amount: 160157590, year: '2019', segment: '7601', date: '43489', docNo: '133900794', selected: false },
    { id: 16, clusterName: '(주)이피케이얼_모던_이커머스물류수수료_E 입점 모던하우스', keywordList: '(주)이피케이얼...', count: 1, amount: 175176219, year: '2019', segment: '7601', date: '43489', docNo: '133900793', selected: false },
    { id: 17, clusterName: '(주)인터김_근지암물류비_원트키즈_판관_HK', keywordList: '(주)인터김,근지...', count: 2, amount: 2572202, year: '2019', segment: '8000', date: '43774', docNo: '137982532', selected: false },
    { id: 18, clusterName: '(주)인터김_본부 해외카주얼가방_수수료_스틱_아웃소싱_인터김_카주얼', keywordList: '(주)인터김,본부...', count: 6, amount: 933360, year: '2019', segment: '8000', date: '43650', docNo: '136268935', selected: false },
    { id: 19, clusterName: '(주)인터김_본부 해외카주얼_수수료_스탁_아웃소싱_인터김_카주얼', keywordList: '(주)인터김,본부...', count: 8, amount: 27636510, year: '2019', segment: '8000', date: '43650', docNo: '136268935', selected: false },
    { id: 20, clusterName: '(주)인터김_본부_해외카주얼가방_아웃소싱수수료_해외카주얼가방', keywordList: '(주)인터김,본부...', count: 1, amount: 203200, year: '2019', segment: '8000', date: '43626', docNo: '135903800', selected: false },
];

// Mock Data - Lv1 목록
const generateLv1List = () => [
    { id: 1, name: '데이터', checked: false },
    { id: 2, name: '대행', checked: false },
    { id: 3, name: '용역', checked: false },
    { id: 4, name: '집행', checked: false },
];

// Mock Data - 병합 결과 확인
const generateMergeResults = () => [
    { id: 1, clusterName: 'HM', keywordList: '구로,구로 남스...', count: 402, amount: 451217150, selected: true },
    { id: 2, clusterName: '이커머스', keywordList: '실비,안분,이커...', count: 1408, amount: 16984864, selected: false },
];

function DetailClusteringPage() {
    const { projectId, sessionId } = useParams();
    const navigate = useNavigate();

    // 세션 정보
    const [sessionInfo] = useState({
        sessionName: '지급수수료_sampl1_2025-10-11'
    });

    // 데이터
    const [keywordSummary, setKeywordSummary] = useState([]);
    const [supplierSummary, setSupplierSummary] = useState([]);
    const [clusterList, setClusterList] = useState([]);
    const [lv1List, setLv1List] = useState([]);
    const [mergeResults, setMergeResults] = useState([]);

    // 페이지네이션
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(1000);
    const [totalRows] = useState(1087);

    // 검색 설정
    const [searchColumn, setSearchColumn] = useState('키워드');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [excludeKeyword, setExcludeKeyword] = useState('');
    const [exactMatch, setExactMatch] = useState(false);
    const [excludeItems, setExcludeItems] = useState(false);
    const [searchInResults, setSearchInResults] = useState(false);

    // 탭 상태
    const [activeTab, setActiveTab] = useState(0);

    // 병합 버튼 단위
    const [mergeUnit, setMergeUnit] = useState('원');

    // 선택 상태
    const [selectAllCluster, setSelectAllCluster] = useState(false);
    const [selectAllKeyword, setSelectAllKeyword] = useState(false);

    // 신규 항목 입력
    const [newLv1Item, setNewLv1Item] = useState('');
    const [newRecommendItem, setNewRecommendItem] = useState('');

    // 병합 결과 검색
    const [mergeSearchKeyword, setMergeSearchKeyword] = useState('');

    // 요약 정보
    const [summaryInfo] = useState({
        totalRows: 1000,
        unmergedClusters: 1087,
        unmergedAmount: 27901718987,
    });

    useEffect(() => {
        setKeywordSummary(generateKeywordSummary());
        setSupplierSummary(generateSupplierSummary());
        setClusterList(generateClusterList());
        setLv1List(generateLv1List());
        setMergeResults(generateMergeResults());
    }, []);

    // 검색
    const handleSearch = () => {
        alert(`"${searchKeyword}" 검색 (컬럼: ${searchColumn})`);
    };

    // 전체 선택 (클러스터)
    const handleSelectAllCluster = () => {
        const newState = !selectAllCluster;
        setSelectAllCluster(newState);
        setClusterList(clusterList.map(c => ({ ...c, selected: newState })));
    };

    // 병합
    const handleMerge = () => {
        const selected = clusterList.filter(c => c.selected);
        if (selected.length < 2) {
            alert('2개 이상의 세부 클러스터를 선택해주세요.');
            return;
        }
        alert(`${selected.length}개 세부 클러스터 병합`);
    };

    // 추가 병합
    const handleAdditionalMerge = () => {
        alert('추가 병합 실행');
    };

    // 선택 항목 자동 클러스터링
    const handleAutoCluster = () => {
        const selected = keywordSummary.filter(k => k.selected);
        alert(`${selected.length}개 키워드 자동 클러스터링`);
    };

    // Lv1 추가
    const handleAddLv1 = () => {
        if (newLv1Item.trim()) {
            setLv1List([...lv1List, { id: Date.now(), name: newLv1Item.trim(), checked: false }]);
            setNewLv1Item('');
        }
    };

    // Lv1 제거
    const handleRemoveLv1 = () => {
        setLv1List(lv1List.filter(item => !item.checked));
    };

    // 추천 키워드 추가/제거
    const handleAddRecommend = () => {
        alert('추천 키워드 추가');
    };

    const handleRemoveRecommend = () => {
        alert('추천 키워드 제거');
    };

    // 병합 결과 버튼들
    const handleViewDetail = () => {
        const selected = mergeResults.filter(m => m.selected);
        alert(`${selected.length}개 항목 상세 보기`);
    };

    const handleMergeBetween = () => {
        const selected = mergeResults.filter(m => m.selected);
        if (selected.length < 2) {
            alert('2개 이상 선택해주세요.');
            return;
        }
        alert(`${selected.length}개 항목 간 병합`);
    };

    const handleUnmerge = () => {
        const selected = mergeResults.filter(m => m.selected);
        alert(`${selected.length}개 항목 병합 해제`);
    };

    const handleMergeSearch = () => {
        alert(`병합 결과 내 "${mergeSearchKeyword}" 검색`);
    };

    // 완료
    const handleComplete = () => {
        navigate(`/projects/${projectId}/sessions/${sessionId}/export`);
    };

    // 키워드별 테이블 컬럼
    const keywordColumns = [
        {
            field: 'selected',
            headerName: '',
            width: 40,
            renderCell: (params) => (
                <Checkbox
                    size="small"
                    checked={params.value}
                    onChange={(e) => {
                        setKeywordSummary(keywordSummary.map(k =>
                            k.id === params.row.id ? { ...k, selected: e.target.checked } : k
                        ));
                    }}
                />
            ),
        },
        { field: 'keyword', headerName: '키워드', flex: 1 },
        { field: 'count', headerName: 'Count', width: 70, valueFormatter: (params) => formatNumber(params.value) },
        { field: 'amount', headerName: '합산금액', width: 130, valueFormatter: (params) => formatCurrency(params.value, '원') },
    ];

    // 공급업체별 테이블 컬럼
        const supplierColumns = [
            {
                field: 'selected',
                headerName: '',
                width: 40,
                renderCell: (params) => (
                    <Checkbox
                        size="small"
                        checked={params.value}
                        onChange={(e) => {
                            setSupplierSummary(supplierSummary.map(s =>
                                s.id === params.row.id ? { ...s, selected: e.target.checked } : s
                            ));
                        }}
                    />
                ),
            },
            // [수정] minWidth 속성 추가
            {
                field: 'supplier',
                headerName: '공급업체',
                flex: 1,
                minWidth: 150 // 탭 전환 시 너비 계산 오류 방지를 위한 최소값
            },
            { field: 'count', headerName: 'Count', width: 70, valueFormatter: (params) => formatNumber(params.value) },
            { field: 'amount', headerName: '합산금액', width: 130, valueFormatter: (params) => formatCurrency(params.value, '원') },
        ];

    // 미병합 클러스터 테이블 컬럼
    const clusterColumns = [
        {
            field: 'selected',
            headerName: '',
            width: 40,
            renderCell: (params) => (
                <Checkbox
                    size="small"
                    checked={params.value}
                    onChange={(e) => {
                        setClusterList(clusterList.map(c =>
                            c.id === params.row.id ? { ...c, selected: e.target.checked } : c
                        ));
                    }}
                />
            ),
        },
        { field: 'clusterName', headerName: '세부 클러스터명', flex: 1, minWidth: 280 },
        { field: 'keywordList', headerName: '키워드목록', width: 120 },
        { field: 'count', headerName: 'Count', width: 60, valueFormatter: (params) => formatNumber(params.value) },
        { field: 'amount', headerName: '합산금액', width: 120, valueFormatter: (params) => formatCurrency(params.value, '원') },
        { field: 'year', headerName: '연도', width: 50 },
        { field: 'segment', headerName: '세그먼트', width: 70 },
        { field: 'date', headerName: '전기일', width: 60 },
        { field: 'docNo', headerName: '문서번호', width: 100 },
    ];

    // 병합 결과 테이블 컬럼
    const mergeResultColumns = [
        {
            field: 'selected',
            headerName: '',
            width: 40,
            renderCell: (params) => (
                <Checkbox
                    size="small"
                    checked={params.value}
                    onChange={(e) => {
                        setMergeResults(mergeResults.map(m =>
                            m.id === params.row.id ? { ...m, selected: e.target.checked } : m
                        ));
                    }}
                />
            ),
        },
        { field: 'clusterName', headerName: '세부 클러스터명', width: 100 },
        { field: 'keywordList', headerName: '키워드목록', flex: 1 },
        { field: 'count', headerName: 'Count', width: 60, valueFormatter: (params) => formatNumber(params.value) },
        { field: 'amount', headerName: '합산금액', width: 120, valueFormatter: (params) => formatCurrency(params.value, '원') },
    ];

    const totalPages = Math.ceil(totalRows / pageSize);

    return (
        <Container maxWidth={false} className={styles.container}>
            {/* 세션 헤더 */}
            <Box className={styles.sessionHeader}>
                <SessionHeader sessionName={sessionInfo?.sessionName} />
            </Box>

            {/* 메인 콘텐츠 */}
            <Grid container spacing={1.5} className={styles.mainContent}>
                {/* 좌측 영역 */}
                <Grid item xs={12} md={7.5}>
                    <Box className={styles.leftPanel}>
                        {/* Clustering 병합 타이틀 */}
                        <Box className={styles.titleSection}>
                            <Typography className={styles.titleText}>세부 Clustering 병합</Typography>
                        </Box>

                        {/* 요약 정보 */}
                        <Box className={styles.summaryRow}>
                            <Typography sx={{ fontSize: '13px' }}>
                                행 수 : <strong>{formatNumber(summaryInfo.totalRows)}</strong>
                            </Typography>
                            <Typography sx={{ fontSize: '13px', mx: 3 }}>
                                미병합 Cluster : <strong>{summaryInfo.unmergedClusters}</strong>
                            </Typography>
                            <Typography sx={{ fontSize: '13px' }}>
                                미병합 합산금액 : <strong>{formatCurrency(summaryInfo.unmergedAmount, '원')}</strong>
                            </Typography>
                        </Box>

                        {/* 검색 설정 */}
                        <Box className={styles.searchSection}>
                            <Grid container spacing={1} alignItems="center">
                                <Grid item xs={1.5}>
                                    <Typography sx={{ fontSize: '12px' }}>검색 설정</Typography>
                                </Grid>
                                <Grid item xs={1.5}>
                                    <Select
                                        size="small"
                                        fullWidth
                                        value={searchColumn}
                                        onChange={(e) => setSearchColumn(e.target.value)}
                                    >
                                        <MenuItem value="키워드">키워드</MenuItem>
                                        <MenuItem value="클러스터명">세부 클러스터명</MenuItem>
                                        <MenuItem value="공급업체">공급업체</MenuItem>
                                    </Select>
                                </Grid>
                                <Grid item xs={1.5}>
                                    <FormControlLabel
                                        control={<Checkbox size="small" checked={exactMatch} onChange={(e) => setExactMatch(e.target.checked)} />}
                                        label={<Typography sx={{ fontSize: '11px' }}>검색 조건 완전 일치</Typography>}
                                    />
                                </Grid>
                                <Grid item xs={1.5}>
                                    <FormControlLabel
                                        control={<Checkbox size="small" checked={excludeItems} onChange={(e) => setExcludeItems(e.target.checked)} />}
                                        label={<Typography sx={{ fontSize: '11px' }}>검색 제외 항목 적용</Typography>}
                                    />
                                </Grid>
                            </Grid>

                            <Grid container spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                <Grid item xs={1.5}>
                                    <Typography sx={{ fontSize: '12px' }}>검색 조건</Typography>
                                </Grid>
                                <Grid item xs={2.5}>
                                    <TextField
                                        size="small"
                                        fullWidth
                                        placeholder="검색 키워드 입력"
                                        value={searchKeyword}
                                        onChange={(e) => setSearchKeyword(e.target.value)}
                                    />
                                </Grid>
                                <Grid item xs={2.5}>
                                    <TextField
                                        size="small"
                                        fullWidth
                                        placeholder="제외 항목 입력"
                                        value={excludeKeyword}
                                        onChange={(e) => setExcludeKeyword(e.target.value)}
                                    />
                                </Grid>
                                <Grid item xs={1.5}>
                                    <FormControlLabel
                                        control={<Checkbox size="small" checked={searchInResults} onChange={(e) => setSearchInResults(e.target.checked)} />}
                                        label={<Typography sx={{ fontSize: '11px' }}>결과 내 재검색</Typography>}
                                    />
                                </Grid>
                                <Grid item xs={1}>
                                    <ActionButton variant="search" size="small" onClick={handleSearch} sx={{ width: '100%' }}>
                                        검 색
                                    </ActionButton>
                                </Grid>
                            </Grid>
                        </Box>

                        {/* 병합 버튼 영역 */}
                        <Box className={styles.mergeButtonRow}>
                            <FormControlLabel
                                control={<Checkbox size="small" checked={selectAllCluster} onChange={handleSelectAllCluster} />}
                                label={<Typography sx={{ fontSize: '12px' }}>전체 선택</Typography>}
                            />
                            <ActionButton variant="merge" size="small" onClick={handleMerge} sx={{ backgroundColor: '#2196F3' }}>
                                병 합
                            </ActionButton>
                            <ActionButton variant="add" size="small" onClick={handleAdditionalMerge} sx={{ backgroundColor: '#9c27b0' }}>
                                추가 병합
                            </ActionButton>
                            <Typography sx={{ fontSize: '12px', ml: 1 }}>단위</Typography>
                            <Select
                                size="small"
                                value={mergeUnit}
                                onChange={(e) => setMergeUnit(e.target.value)}
                                sx={{ minWidth: 60 }}
                            >
                                <MenuItem value="원">원</MenuItem>
                                <MenuItem value="천원">천원</MenuItem>
                            </Select>
                        </Box>

                        {/* 미병합 클러스터 조회 목록 */}
                        <Box className={styles.clusterTableSection}>
                            <StyledDataGrid
                                title="미병합 세부 클러스터 조회 목록"
                                rows={clusterList}
                                columns={clusterColumns}
                                height="calc(100vh - 450px)"
                            />
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

                {/* 우측 영역 */}
                <Grid item xs={12} md={4.5} >
                    <Box className={styles.rightPanel}>
                        {/* 키워드별/공급업체별 탭 테이블 */}
                        <Box className={styles.tabTableSection}>
                            <Tabs
                                value={activeTab}
                                onChange={(e, v) => setActiveTab(v)}
                                sx={{ borderBottom: '1px solid #ddd', minHeight: '36px' }}
                            >
                                <Tab label="키워드별" sx={{ fontSize: '12px', minHeight: '36px', py: 0.5 }} />
                                <Tab label="공급업체별" sx={{ fontSize: '12px', minHeight: '36px', py: 0.5 }} />
                            </Tabs>

                            <Box sx={{ height: 'calc(30vh - 60px)' }}>
                                {activeTab === 0 ? (
                                    <StyledDataGrid
                                        key="keyword-grid" /* [핵심] 키워드 탭용 명찰 부착 */
                                        rows={keywordSummary}
                                        columns={keywordColumns}
                                        height="calc(30vh - 60px)"
                                    />
                                ) : (
                                    <StyledDataGrid
                                        key="supplier-grid" /* [핵심] 공급업체 탭용 명찰 부착 */
                                        rows={supplierSummary}
                                        columns={supplierColumns}
                                        height="calc(30vh - 60px)"
                                    />
                                )}
                            </Box>

                            <ActionButton
                                variant="apply"
                                size="small"
                                onClick={handleAutoCluster}
                                sx={{ width: '100%', mt: 0.5, backgroundColor: '#2196F3' }}
                            >
                                선택항목 자동 클러스터링
                            </ActionButton>
                        </Box>

                        {/* Lv1 선택 + 추천 키워드 선택 (같은 높이) */}
                        <Grid container spacing={1}>
                            <Grid item xs={6}>
                                <StyledGroupBox title="Lv1 선택" sx={{ height: '100%' }}>
                                    <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                                        <TextField
                                            size="small"
                                            placeholder="신규 항목 입력"
                                            value={newLv1Item}
                                            onChange={(e) => setNewLv1Item(e.target.value)}
                                            sx={{ flex: 1 }}
                                        />
                                        <ActionButton variant="add" size="small" onClick={handleAddLv1} sx={{ minWidth: '40px', fontSize: '11px' }}>
                                            추가
                                        </ActionButton>
                                        <ActionButton variant="delete" size="small" onClick={handleRemoveLv1} sx={{ minWidth: '40px', fontSize: '11px' }}>
                                            제거
                                        </ActionButton>
                                    </Box>
                                    <Box className={styles.checkboxList}>
                                        {lv1List.map(item => (
                                            <FormControlLabel
                                                key={item.id}
                                                control={
                                                    <Checkbox
                                                        size="small"
                                                        checked={item.checked}
                                                        onChange={(e) => {
                                                            setLv1List(lv1List.map(l =>
                                                                l.id === item.id ? { ...l, checked: e.target.checked } : l
                                                            ));
                                                        }}
                                                    />
                                                }
                                                label={<Typography sx={{ fontSize: '11px' }}>{item.name}</Typography>}
                                            />
                                        ))}
                                    </Box>
                                </StyledGroupBox>
                            </Grid>
                            <Grid item xs={6}>
                                <StyledGroupBox title="추천 키워드 선택" sx={{ height: '100%' }}>
                                    <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                                        <TextField
                                            size="small"
                                            placeholder="신규 항목 입력"
                                            value={newRecommendItem}
                                            onChange={(e) => setNewRecommendItem(e.target.value)}
                                            sx={{ flex: 1 }}
                                        />
                                        <ActionButton variant="add" size="small" onClick={handleAddRecommend} sx={{ minWidth: '40px', fontSize: '11px' }}>
                                            추가
                                        </ActionButton>
                                        <ActionButton variant="delete" size="small" onClick={handleRemoveRecommend} sx={{ minWidth: '40px', fontSize: '11px' }}>
                                            제거
                                        </ActionButton>
                                    </Box>
                                    <Box className={styles.checkboxList}>
                                        {/* 추천 키워드 목록 */}
                                    </Box>
                                </StyledGroupBox>
                            </Grid>
                        </Grid>

                        {/* Clustering 병합 결과 확인 */}
                        <StyledGroupBox title="세부 Clustering 병합 결과 확인">
                            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5  }}>
                                <ActionButton
                                    variant="apply"
                                    size="small"
                                    onClick={handleViewDetail}
                                    sx={{ flex: 1, backgroundColor: '#2196F3', fontSize: '11px' }}
                                >
                                    선택 항목 상세 보기
                                </ActionButton>
                                <ActionButton
                                    variant="merge"
                                    size="small"
                                    onClick={handleMergeBetween}
                                    sx={{ flex: 1, backgroundColor: '#9c27b0', fontSize: '11px' }}
                                >
                                    선택 항목간 병합
                                </ActionButton>
                                <ActionButton
                                    variant="delete"
                                    size="small"
                                    onClick={handleUnmerge}
                                    sx={{ flex: 1, backgroundColor: '#e91e63', fontSize: '11px' }}
                                >
                                    선택 항목 병합해제
                                </ActionButton>
                            </Box>

                            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                                <TextField
                                    size="small"
                                    placeholder="키워드 입력"
                                    value={mergeSearchKeyword}
                                    onChange={(e) => setMergeSearchKeyword(e.target.value)}
                                    sx={{ flex: 1 }}
                                />
                                <ActionButton variant="search" size="small" onClick={handleMergeSearch}>
                                    검 색
                                </ActionButton>
                            </Box>

                            <StyledDataGrid
                                rows={mergeResults}
                                columns={mergeResultColumns}
                                height="140px"
                            />

                            <Typography sx={{ fontSize: '10px', color: '#e91e63', mt: 0.5 }}>
                                * 클러스터명은 직접 수정이 가능합니다.
                            </Typography>
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

export default DetailClusteringPage;
