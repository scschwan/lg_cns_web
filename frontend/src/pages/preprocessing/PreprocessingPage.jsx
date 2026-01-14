// frontend/src/pages/preprocessing/PreprocessingPage.jsx

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
} from '@mui/material';

import {
    SessionHeader,
    StyledGroupBox,
    StyledDataGrid,
    ActionButton,
} from '../../components/common';

import styles from './PreprocessingPage.module.css';

// Mock Data - 키워드 추출 대상 (이름 컬럼)
const generateExtractTargetData = () => {
    const names = [
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',
        '이커머스 실비 안분_지급수수료',

    ];
    return names.map((name, idx) => ({
        id: idx + 1,
        이름: name,
    }));
};

// Mock Data - 키워드 추출 결과
const generateExtractResultData = () => {
    const results = [
        { co: '인터넷몰 더데...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 로엠...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 포인포...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 오휴', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 핸트...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 쓰리엔', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 지크', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 엘본', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 이즈...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 트루', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 CMC...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 모스...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 쓰시에', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 오스본', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 보보...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 일로...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 리틀', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 밀리밤', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 펠릭...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 스탭...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 신디...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 인디...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 엠아...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 란찌', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 SAP', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 트렌...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 알토', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 데이텀', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 신드', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 비욘드', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 핸트...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 쓰리엔', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 지크', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 엘본', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 이즈...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 트루', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 CMC...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 모스...', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
        { co: '인터넷몰 쓰시에', account: '지급수수료(통...', c0: '이커머스', c1: '실비', c2: '안분', c3: '지급수수료' },
    ];
    return results.map((r, idx) => ({
        id: idx + 1,
        'CO 오브젝트이름': r.co,
        '상계계정이름': r.account,
        Column0: r.c0,
        Column1: r.c1,
        Column2: r.c2,
        Column3: r.c3,
    }));
};

function PreprocessingPage() {
    const { projectId, sessionId } = useParams();
    const navigate = useNavigate();

    // 세션 정보
    const [sessionInfo] = useState({
        sessionName: '지급수수료_sampl1_2025-10-11'
    });

    // 데이터
    const [targetData, setTargetData] = useState([]);
    const [resultData, setResultData] = useState([]);

    // 구분자 변환
    const [newSeparator, setNewSeparator] = useState('');
    const [separatorList, setSeparatorList] = useState([
        { id: 1, value: ' ', checked: false },
        { id: 2, value: ',', checked: false },
        { id: 3, value: ',', checked: false },
        { id: 4, value: '/', checked: false },
        { id: 5, value: '&', checked: false },
        { id: 6, value: '*', checked: false },
    ]);
    const [selectAllSeparator, setSelectAllSeparator] = useState(false);

    // 불용어 제거
    const [newStopword, setNewStopword] = useState('');
    const [stopwordList, setStopwordList] = useState([
        { id: 1, value: '12월', checked: false },
        { id: 2, value: '11월', checked: false },
        { id: 3, value: '10월', checked: false },
        { id: 4, value: '9월', checked: false },
    ]);
    const [selectAllStopword, setSelectAllStopword] = useState(false);

    // NLP 설정
    const [minKeywordLength, setMinKeywordLength] = useState(4);

    useEffect(() => {
        setTargetData(generateExtractTargetData());
        setResultData(generateExtractResultData());
    }, []);

    // 구분자 추가
    const handleAddSeparator = () => {
        if (newSeparator.trim()) {
            setSeparatorList([
                ...separatorList,
                { id: Date.now(), value: newSeparator.trim(), checked: false }
            ]);
            setNewSeparator('');
        }
    };

    // 구분자 항목 제거
    const handleRemoveSeparator = () => {
        setSeparatorList(separatorList.filter(item => !item.checked));
    };

    // 불용어 추가
    const handleAddStopword = () => {
        if (newStopword.trim()) {
            setStopwordList([
                ...stopwordList,
                { id: Date.now(), value: newStopword.trim(), checked: false }
            ]);
            setNewStopword('');
        }
    };

    // 불용어 항목 제거
    const handleRemoveStopword = () => {
        setStopwordList(stopwordList.filter(item => !item.checked));
    };

    // 키워드 추출
    const handleKeywordExtract = () => {
        alert('키워드 추출 실행');
    };

    // 1글자 키워드 제거
    const handleRemoveSingleChar = () => {
        alert('1글자 키워드 제거 실행');
    };

    // NLP 키워드 추출
    const handleNlpExtract = () => {
        alert(`NLP 기반 키워드 추출 (${minKeywordLength}글자 이상)`);
    };

    // 완료
    const handleComplete = () => {
        navigate(`/projects/${projectId}/sessions/${sessionId}/transform`);
    };

    // 추출 대상 컬럼
    const targetColumns = [
        { field: '이름', headerName: '이름', flex: 1, minWidth: 250 },
    ];

    // 추출 결과 컬럼
    const resultColumns = [
        { field: 'CO 오브젝트이름', headerName: 'CO 오브젝트이름', width: 120 },
        { field: '상계계정이름', headerName: '상계계정이름', width: 120 },
        { field: 'Column0', headerName: 'Column0', width: 90 },
        { field: 'Column1', headerName: 'Column1', width: 80 },
        { field: 'Column2', headerName: 'Column2', width: 80 },
        { field: 'Column3', headerName: 'Column3', width: 90 },
    ];

    return (
        <Container maxWidth={false} className={styles.container}>
            {/* 세션 헤더 */}
            <Box className={styles.sessionHeader}>
                <SessionHeader sessionName={sessionInfo?.sessionName} />
            </Box>

            {/* 메인 콘텐츠 */}
            <Grid container spacing={2} className={styles.mainContent}>
                {/* 좌측 영역 - 테이블 */}
                <Grid item xs={12} md={8}>
                    <Box className={styles.leftPanel}>
                        <Grid container spacing={1} sx={{ height: '100%' }}>
                            {/* 키워드 추출 대상 */}
                            <Grid item xs={5}>
                                <StyledDataGrid
                                    title="키워드 추출 대상"
                                    rows={targetData}
                                    columns={targetColumns}
                                    height="calc(100vh - 180px)"
                                />
                            </Grid>

                            {/* 키워드 추출 결과 */}
                            <Grid item xs={7}>
                                <StyledDataGrid
                                    title="키워드 추출 결과"
                                    rows={resultData}
                                    columns={resultColumns}
                                    height="calc(100vh - 180px)"
                                />
                            </Grid>
                        </Grid>
                    </Box>
                </Grid>

                {/* 우측 영역 - 설정 패널 */}
                <Grid item xs={12} md={4}>
                    <Box className={styles.rightPanel} sx={{
                                                              // 1. 박스 높이를 '내용물 크기'에 딱 맞춥니다 (늘어나지 않게 함)
                                                              height: 'fit-content',

                                                              // 2. 내부 콘텐츠 영역의 상하 여백을 강제로 줄입니다.
                                                              // (StyledGroupBox 내부 구조에 따라 div나 .MuiBox-root 등을 타겟팅)
                                                              '& > div:last-child': {
                                                                  padding: '8px 16px !important', // 상하 8px, 좌우 16px (기존 대비 절반 이하로 축소)
                                                              },
                                                              // 혹시 위 선택자가 안 먹힐 경우를 대비한 일반적인 padding 제어
                                                              paddingBottom: '0px !important'
                                                          }}>
                        {/* 구분자 변환 */}
                        <StyledGroupBox title="구분자 변환">
                            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                <TextField
                                    size="small"
                                    placeholder="신규 변환 대상 입력"
                                    value={newSeparator}
                                    onChange={(e) => setNewSeparator(e.target.value)}
                                    sx={{ flex: 1 }}
                                />
                                <ActionButton
                                    variant="add"
                                    size="small"
                                    onClick={handleAddSeparator}
                                    sx={{ backgroundColor: '#e91e63', minWidth: '70px' }}
                                >
                                    대상 추가
                                </ActionButton>

                            </Box>

                            <Box className={styles.checkboxList}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            size="small"
                                            checked={selectAllSeparator}
                                            onChange={(e) => {
                                                setSelectAllSeparator(e.target.checked);
                                                setSeparatorList(separatorList.map(item => ({
                                                    ...item,
                                                    checked: e.target.checked
                                                })));
                                            }}
                                        />
                                    }
                                    label={<Typography sx={{ fontSize: '12px' }}>전체 선택</Typography>}
                                />
                                {separatorList.map(item => (
                                    <FormControlLabel
                                        key={item.id}
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={item.checked}
                                                onChange={(e) => {
                                                    setSeparatorList(separatorList.map(s =>
                                                        s.id === item.id ? { ...s, checked: e.target.checked } : s
                                                    ));
                                                }}
                                            />
                                        }
                                        label={<Typography sx={{ fontSize: '12px' }}>{item.value}</Typography>}
                                    />
                                ))}
                            </Box>

                            <ActionButton
                                variant="delete"
                                size="small"
                                onClick={handleRemoveSeparator}
                                sx={{ width: '100%', backgroundColor: '#e91e63' }}
                            >
                                항목 제거
                            </ActionButton>
                        </StyledGroupBox>

                        {/* 불용어 제거 */}
                        <StyledGroupBox title="불용어 제거">
                            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                <TextField
                                    size="small"
                                    placeholder="신규 불용어 대상 입력"
                                    value={newStopword}
                                    onChange={(e) => setNewStopword(e.target.value)}
                                    sx={{ flex: 1 }}
                                />
                                <ActionButton
                                    variant="add"
                                    size="small"
                                    onClick={handleAddStopword}
                                    sx={{ backgroundColor: '#2196F3', minWidth: '70px' }}
                                >
                                    대상 추가
                                </ActionButton>
                            </Box>

                            <Box className={styles.checkboxList}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            size="small"
                                            checked={selectAllStopword}
                                            onChange={(e) => {
                                                setSelectAllStopword(e.target.checked);
                                                setStopwordList(stopwordList.map(item => ({
                                                    ...item,
                                                    checked: e.target.checked
                                                })));
                                            }}
                                        />
                                    }
                                    label={<Typography sx={{ fontSize: '12px' }}>전체 선택</Typography>}
                                />
                                {stopwordList.map(item => (
                                    <FormControlLabel
                                        key={item.id}
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={item.checked}
                                                onChange={(e) => {
                                                    setStopwordList(stopwordList.map(s =>
                                                        s.id === item.id ? { ...s, checked: e.target.checked } : s
                                                    ));
                                                }}
                                            />
                                        }
                                        label={<Typography sx={{ fontSize: '12px' }}>{item.value}</Typography>}
                                    />
                                ))}
                            </Box>

                            <ActionButton
                                variant="delete"
                                size="small"
                                onClick={handleRemoveStopword}
                                sx={{ width: '100%', backgroundColor: '#e91e63' }}
                            >
                                항목 제거
                            </ActionButton>
                        </StyledGroupBox>

                        {/* 구분자 기반 키워드 추출 */}
                       {/* 구분자 기반 키워드 추출 */}
                       <StyledGroupBox
                           title="구분자 기반 키워드 추출"

                       >
                           <Box sx={{ display: 'flex', gap: 1 }}>
                               <ActionButton
                                   variant="apply"
                                   size="small"
                                   onClick={handleKeywordExtract}
                                   sx={{ flex: 1, backgroundColor: '#2196F3' }}
                               >
                                   키워드 추출
                               </ActionButton>
                               <ActionButton
                                   variant="apply"
                                   size="small"
                                   onClick={handleRemoveSingleChar}
                                   sx={{ flex: 1, backgroundColor: '#2196F3' }}
                               >
                                   1글자 키워드제거
                               </ActionButton>
                           </Box>
                       </StyledGroupBox>

                        {/* NLP 기반 키워드 추출 */}
                        <StyledGroupBox title="NLP 기반 키워드 추출">
                            <Typography sx={{ fontSize: '11px', color: '#e91e63', mb: 1 }}>
                                * 구분자 기반으로 키워드 추출 후<br />
                                AI가 추가적으로 키워드를 분할합니다.
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <TextField
                                    type="number"
                                    size="small"
                                    value={minKeywordLength}
                                    onChange={(e) => setMinKeywordLength(parseInt(e.target.value) || 4)}
                                    inputProps={{ min: 1, max: 10 }}
                                    sx={{ width: '60px' }}
                                />
                                <Typography sx={{ fontSize: '12px' }}>
                                    글자 이상 키워드 자동 분할
                                </Typography>
                            </Box>
                            <ActionButton
                                variant="apply"
                                size="small"
                                onClick={handleNlpExtract}
                                sx={{ width: '100%', backgroundColor: '#9c27b0' }}
                            >
                                키워드 추출
                            </ActionButton>
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

export default PreprocessingPage;
