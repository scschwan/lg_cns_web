// frontend/src/pages/preprocessing/PreprocessingPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    Grid,
    TextField,
    Typography,
} from '@mui/material';

import {
    SessionHeader,
    StyledGroupBox,
    StyledDataGrid,
    ActionButton,
} from '../../components/common';

import {
    getPreprocessingData,
    getSeparatorList,
    getStopwordList,
    getSessionInfo,
} from '../../services/mockDataService';

import styles from './PreprocessingPage.module.css';

function PreprocessingPage() {
    const { projectId, sessionId } = useParams();
    const navigate = useNavigate();

    // 세션 정보
    const [sessionInfo, setSessionInfo] = useState(null);

    // 데이터
    const [targetData, setTargetData] = useState([]);
    const [appliedData, setAppliedData] = useState([]);

    // 구분자 변환
    const [separatorList, setSeparatorList] = useState([]);
    const [newSeparator, setNewSeparator] = useState('');

    // 불용어 제거
    const [stopwordList, setStopwordList] = useState([]);
    const [newStopword, setNewStopword] = useState('');

    // 키워드 추출
    const [extractKeyword, setExtractKeyword] = useState('');
    const [extractedList, setExtractedList] = useState([]);

    // 선택 상태
    const [selectedSeparators, setSelectedSeparators] = useState([]);
    const [selectedStopwords, setSelectedStopwords] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        const session = getSessionInfo();
        setSessionInfo(session);

        const { targetData, appliedData } = getPreprocessingData();
        setTargetData(targetData);
        setAppliedData(appliedData);

        setSeparatorList(getSeparatorList());
        setStopwordList(getStopwordList());
    };

    // 구분자 추가
    const handleAddSeparator = () => {
        if (newSeparator.trim()) {
            const newItem = {
                id: separatorList.length + 1,
                separator: newSeparator.trim(),
                description: '사용자 추가',
            };
            setSeparatorList([...separatorList, newItem]);
            setNewSeparator('');
        }
    };

    // 구분자 삭제
    const handleDeleteSeparator = () => {
        const filtered = separatorList.filter(
            (item) => !selectedSeparators.includes(item.id)
        );
        setSeparatorList(filtered);
        setSelectedSeparators([]);
    };

    // 불용어 추가
    const handleAddStopword = () => {
        if (newStopword.trim()) {
            const newItem = {
                id: stopwordList.length + 1,
                stopword: newStopword.trim(),
            };
            setStopwordList([...stopwordList, newItem]);
            setNewStopword('');
        }
    };

    // 불용어 삭제
    const handleDeleteStopword = () => {
        const filtered = stopwordList.filter(
            (item) => !selectedStopwords.includes(item.id)
        );
        setStopwordList(filtered);
        setSelectedStopwords([]);
    };

    // 키워드 추출
    const handleExtractKeyword = () => {
        if (extractKeyword.trim()) {
            const newItem = {
                id: extractedList.length + 1,
                keyword: extractKeyword.trim(),
            };
            setExtractedList([...extractedList, newItem]);
            setExtractKeyword('');
        }
    };

    // 완료 버튼
    const handleComplete = () => {
        alert('전처리 완료! 데이터 변환 화면으로 이동합니다.');
        navigate(`/projects/${projectId}/sessions/${sessionId}/transform`);
    };

    // 원본 테이블 컬럼
    const targetColumns = [
        { field: 'id', headerName: 'No', width: 70 },
        { field: '원본텍스트', headerName: '원본 텍스트', flex: 1, minWidth: 300 },
        { field: '키워드', headerName: '키워드', width: 150 },
    ];

    // 적용 테이블 컬럼
    const appliedColumns = [
        { field: 'id', headerName: 'No', width: 70 },
        { field: '변환텍스트', headerName: '변환 텍스트', flex: 1, minWidth: 300 },
        { field: '추출키워드', headerName: '추출 키워드', width: 150 },
    ];

    // 구분자 테이블 컬럼
    const separatorColumns = [
        { field: 'separator', headerName: '구분자', width: 80 },
        { field: 'description', headerName: '설명', flex: 1 },
    ];

    // 불용어 테이블 컬럼
    const stopwordColumns = [
        { field: 'stopword', headerName: '불용어', flex: 1 },
    ];

    // 추출 키워드 테이블 컬럼
    const extractedColumns = [
        { field: 'keyword', headerName: '추출 키워드', flex: 1 },
    ];

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
                        {/* 두 테이블 나란히 */}
                        <Grid container spacing={2} className={styles.tableContainer}>
                            <Grid item xs={6}>
                                <StyledDataGrid
                                    title="전처리 대상 테이블"
                                    rows={targetData}
                                    columns={targetColumns}
                                    height="calc(100vh - 250px)"
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <StyledDataGrid
                                    title="전처리 적용 테이블"
                                    rows={appliedData}
                                    columns={appliedColumns}
                                    height="calc(100vh - 250px)"
                                />
                            </Grid>
                        </Grid>
                    </Box>
                </Grid>

                {/* 우측 영역 (28%) */}
                <Grid item xs={12} md={3.5}>
                    <Box className={styles.rightPanel}>
                        {/* 구분자 변환 */}
                        <StyledGroupBox
                            title="구분자 변환"
                            warningText="구분자를 기준으로 텍스트를 분리합니다."
                            sx={{ flex: '0 0 30%' }}
                        >
                            <Box className={styles.groupContent}>
                                <StyledDataGrid
                                    rows={separatorList}
                                    columns={separatorColumns}
                                    height="100px"
                                    checkboxSelection
                                    onSelectionChange={(ids) => setSelectedSeparators(ids)}
                                    selectionModel={selectedSeparators}
                                />
                                <Box className={styles.inputRow}>
                                    <TextField
                                        size="small"
                                        placeholder="구분자 입력"
                                        value={newSeparator}
                                        onChange={(e) => setNewSeparator(e.target.value)}
                                        className={styles.inputField}
                                    />
                                    <ActionButton variant="add" size="small" onClick={handleAddSeparator}>
                                        추가
                                    </ActionButton>
                                    <ActionButton variant="delete" size="small" onClick={handleDeleteSeparator}>
                                        삭제
                                    </ActionButton>
                                </Box>
                            </Box>
                        </StyledGroupBox>

                        {/* 불용어 제거 */}
                        <StyledGroupBox
                            title="불용어 제거"
                            warningText="지정한 불용어를 텍스트에서 제거합니다."
                            sx={{ flex: '0 0 30%' }}
                        >
                            <Box className={styles.groupContent}>
                                <StyledDataGrid
                                    rows={stopwordList}
                                    columns={stopwordColumns}
                                    height="100px"
                                    checkboxSelection
                                    onSelectionChange={(ids) => setSelectedStopwords(ids)}
                                    selectionModel={selectedStopwords}
                                />
                                <Box className={styles.inputRow}>
                                    <TextField
                                        size="small"
                                        placeholder="불용어 입력"
                                        value={newStopword}
                                        onChange={(e) => setNewStopword(e.target.value)}
                                        className={styles.inputField}
                                    />
                                    <ActionButton variant="add" size="small" onClick={handleAddStopword}>
                                        추가
                                    </ActionButton>
                                    <ActionButton variant="delete" size="small" onClick={handleDeleteStopword}>
                                        삭제
                                    </ActionButton>
                                </Box>
                            </Box>
                        </StyledGroupBox>

                        {/* 구분자 기반 키워드 추출 */}
                        <StyledGroupBox
                            title="구분자 기반 키워드 추출"
                            warningText="구분자로 분리된 키워드를 추출합니다."
                            sx={{ flex: '0 0 15%' }}
                        >
                            <Box className={styles.inputRow}>
                                <TextField
                                    size="small"
                                    placeholder="키워드 입력"
                                    value={extractKeyword}
                                    onChange={(e) => setExtractKeyword(e.target.value)}
                                    className={styles.inputField}
                                />
                                <ActionButton variant="apply" size="small" onClick={handleExtractKeyword}>
                                    추출
                                </ActionButton>
                            </Box>
                        </StyledGroupBox>

                        {/* NLP 기반 키워드 추출 (Hidden - 향후 구현) */}
                        <StyledGroupBox
                            title="NLP 기반 키워드 추출"
                            warningText="자연어 처리 기반 키워드 추출 (준비 중)"
                            sx={{ flex: '0 0 15%', opacity: 0.5 }}
                        >
                            <Typography
                                sx={{
                                    fontFamily: 'Pretendard, sans-serif',
                                    fontSize: '13px',
                                    color: '#666',
                                    textAlign: 'center',
                                    padding: '1rem',
                                }}
                            >
                                향후 업데이트 예정
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
                                완료
                            </ActionButton>
                        </Box>
                    </Box>
                </Grid>
            </Grid>
        </Container>
    );
}

export default PreprocessingPage;
