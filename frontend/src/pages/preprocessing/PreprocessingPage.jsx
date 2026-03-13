// frontend/src/pages/preprocessing/PreprocessingPage.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Plus, Trash2, Lock } from 'lucide-react';
import preprocessingService from '../../services/preprocessingService';
import { useSessionEditorLock } from '../../hooks/useSessionEditorLock';
import uploadService from '../../services/uploadService';
import AdvancedTable from '@/components/AdvancedTable';
import useViewerMode from '../../hooks/useViewerMode';

// shadcn/ui components
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ===== 멀티셀렉트 체크박스 리스트 컴포넌트 (StartAnalysis와 동일) =====
function MultiSelectCheckList({ items, checkedSet, onCheckedChange, renderLabel, getKey, className = '', disabled = false }) {
  const [cursorSet, setCursorSet] = useState(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(null);
  const listRef = useRef(null);

  const handleMouseDown = (e, key, idx) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setCursorSet(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = idx;
    setCursorSet(new Set([key]));
  };

  const handleMouseEnter = (key, idx) => {
    if (!isDragging || dragStartRef.current === null) return;
    const startIdx = dragStartRef.current;
    const minIdx = Math.min(startIdx, idx);
    const maxIdx = Math.max(startIdx, idx);
    const newSet = new Set();
    for (let i = minIdx; i <= maxIdx; i++) {
      newSet.add(getKey(items[i], i));
    }
    setCursorSet(newSet);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const handleCheckToggle = (key) => {
    if (cursorSet.size > 0 && cursorSet.has(key)) {
      const isCurrentlyChecked = checkedSet.has(key);
      const newChecked = new Set(checkedSet);
      cursorSet.forEach(k => {
        if (isCurrentlyChecked) newChecked.delete(k);
        else newChecked.add(k);
      });
      onCheckedChange(newChecked);
    } else {
      const newChecked = new Set(checkedSet);
      if (newChecked.has(key)) newChecked.delete(key);
      else newChecked.add(key);
      onCheckedChange(newChecked);
    }
  };

  return (
    <div ref={listRef} className={`select-none ${className}`} onMouseUp={handleMouseUp}>
      {items.map((item, idx) => {
        const key = getKey(item, idx);
        const isCursor = cursorSet.has(key);
        const isChecked = checkedSet.has(key);
        return (
          <div
            key={key}
            className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors
              ${isCursor ? 'bg-blue-100 ring-1 ring-blue-300' : 'hover:bg-gray-50'}
              ${isChecked ? 'bg-blue-50' : ''}`}
            onMouseDown={(e) => handleMouseDown(e, key, idx)}
            onMouseEnter={() => handleMouseEnter(key, idx)}
          >
            <Checkbox
              checked={isChecked}
              onCheckedChange={() => handleCheckToggle(key)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              disabled={disabled}
            />
            {renderLabel(item, isChecked)}
          </div>
        );
      })}
    </div>
  );
}

function PreprocessingPage() {
  const { projectId, sessionId } = useParams();
  const { isEditor, editorInfo } = useSessionEditorLock(projectId, sessionId);
  const navigate = useNavigate();
  const { isViewer } = useViewerMode(projectId);

  // ===== 상태 관리 =====
  const [sessionInfo, setSessionInfo] = useState({
    sessionName: '',
    totalRowCount: 0,
    totalAmount: 0,
    targetColumn: '',
    costCenterColumn: '',
    supplierColumn: '',
  });

  // 데이터
  const [targetData, setTargetData] = useState([]);
  const [resultData, setResultData] = useState([]);
  const [maxKeywordCols, setMaxKeywordCols] = useState(0);
  const [loading, setLoading] = useState(false);

  // 페이징
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // 구분자 변환
  const [newSeparator, setNewSeparator] = useState('');
  const [separatorList, setSeparatorList] = useState([]);
  const [separatorCheckedSet, setSeparatorCheckedSet] = useState(new Set());

  // 불용어 제거
  const [newStopword, setNewStopword] = useState('');
  const [stopwordList, setStopwordList] = useState([]);
  const [stopwordCheckedSet, setStopwordCheckedSet] = useState(new Set());

  // 처리 상태
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [removingSingle, setRemovingSingle] = useState(false);
  const [singleCharProgress, setSingleCharProgress] = useState(0);
  const [savingConfig, setSavingConfig] = useState(false);

  // NLP 설정
  const [minKeywordLength, setMinKeywordLength] = useState(4);
  const [nlpExtracting, setNlpExtracting] = useState(false);
  const [nlpProgress, setNlpProgress] = useState(0);

  // 테이블 정렬
  const [targetSort, setTargetSort] = useState(null);
  const [resultSort, setResultSort] = useState(null);

  // ===== 세션 정보 로드 =====
  useEffect(() => {
    const loadSessionInfo = async () => {
      try {
        const info = await preprocessingService.getSessionInfo(projectId, sessionId);
        setSessionInfo({
          sessionName: info.sessionName || sessionId,
          totalRowCount: info.totalRowCount || 0,
          totalAmount: info.totalAmount || 0,
          targetColumn: info.targetColumn || '',
          costCenterColumn: info.costCenterColumn || '',
          supplierColumn: info.supplierColumn || '',
        });
      } catch (error) {
        console.error('세션 정보 로드 실패:', error);
      }
    };
    loadSessionInfo();
  }, [projectId, sessionId]);

  // ===== 구분자/불용어 설정 로드 =====
  // 주의: UI의 checkedSet은 "삭제 대상 선택"용이므로 로드 시 비어있어야 함
  // 백엔드의 config.checked는 "키워드 추출에 활성"인지 여부 (별도 관리)
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await preprocessingService.getConfig(projectId, sessionId);
        if (config.separators) {
          setSeparatorList(config.separators);
          setSeparatorCheckedSet(new Set()); // UI 체크는 비움 (삭제용)
        }
        if (config.stopwords) {
          setStopwordList(config.stopwords);
          setStopwordCheckedSet(new Set()); // UI 체크는 비움 (삭제용)
        }
      } catch (error) {
        console.error('설정 로드 실패:', error);
      }
    };
    loadConfig();
  }, [projectId, sessionId]);

  // ===== 데이터 로드 =====
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await preprocessingService.getProcessData(projectId, sessionId, currentPage, pageSize);
      setTargetData(result.targetData || []);
      setResultData(result.resultData || []);
      setTotalRows(result.totalCount || 0);
      setTotalPages(result.totalPages || 0);
      setMaxKeywordCols(result.maxKeywordCols || 0);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId, currentPage, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ===== 설정 저장 =====
  // 목록에 있는 항목은 모두 활성(checked=true) - 사용자가 삭제하면 목록에서 제거
  const saveConfigToServer = useCallback(async (sepList, swList) => {
    setSavingConfig(true);
    try {
      const separators = sepList.map(s => ({
        value: s.value,
        checked: true,
      }));
      const stopwords = swList.map(s => ({
        value: s.value,
        checked: true,
      }));
      await preprocessingService.saveConfig(projectId, sessionId, { separators, stopwords });
    } catch (error) {
      console.error('설정 저장 실패:', error);
    } finally {
      setSavingConfig(false);
    }
  }, [projectId, sessionId]);

  // ===== 구분자 핸들러 =====
  const handleAddSeparator = () => {
    if (isViewer) return;
    // 공백(' ')도 유효한 구분자이므로 trim() 대신 빈 문자열만 체크
    const value = newSeparator;
    if (value === '') return;
    // 중복 방지
    if (separatorList.some(s => s.value === value)) {
      alert('이미 존재하는 구분자입니다.');
      setNewSeparator('');
      return;
    }
    const updated = [...separatorList, { value, checked: true }];
    setSeparatorList(updated);
    setNewSeparator('');
    saveConfigToServer(updated, stopwordList);
  };

  const handleRemoveSeparator = () => {
    if (isViewer) return;
    if (separatorCheckedSet.size === 0) {
      alert('제거할 항목을 선택해주세요.');
      return;
    }
    const remaining = separatorList.filter((_, i) => !separatorCheckedSet.has(i));
    setSeparatorList(remaining);
    setSeparatorCheckedSet(new Set());
    saveConfigToServer(remaining, stopwordList);
  };

  const handleSeparatorCheckedChange = (newCheckedSet) => {
    setSeparatorCheckedSet(newCheckedSet);
  };

  // ===== 불용어 핸들러 =====
  const handleAddStopword = () => {
    if (isViewer) return;
    if (!newStopword.trim()) return;
    const value = newStopword.trim();
    // 중복 방지
    if (stopwordList.some(s => s.value === value)) {
      alert('이미 존재하는 불용어입니다.');
      setNewStopword('');
      return;
    }
    const updated = [...stopwordList, { value, checked: true }];
    setStopwordList(updated);
    setNewStopword('');
    saveConfigToServer(separatorList, updated);
  };

  const handleRemoveStopword = () => {
    if (isViewer) return;
    if (stopwordCheckedSet.size === 0) {
      alert('제거할 항목을 선택해주세요.');
      return;
    }
    const remaining = stopwordList.filter((_, i) => !stopwordCheckedSet.has(i));
    setStopwordList(remaining);
    setStopwordCheckedSet(new Set());
    saveConfigToServer(separatorList, remaining);
  };

  const handleStopwordCheckedChange = (newCheckedSet) => {
    setStopwordCheckedSet(newCheckedSet);
  };

  // ===== 진행률 폴링 헬퍼 =====
  const pollProgress = async (type, setProgress) => {
    let attempts = 0;
    while (attempts < 300) {
      await new Promise(r => setTimeout(r, 500));
      attempts++;
      try {
        const status = await preprocessingService.getExtractProgress(projectId, sessionId, type);
        setProgress(status.progress || 0);
        if (status.status === 'COMPLETED') return;
      } catch (e) { /* ignore polling errors */ }
    }
  };

  // ===== 키워드 추출 =====
  const handleKeywordExtract = async () => {
    if (isViewer) return;
    setExtracting(true);
    setExtractProgress(0);
    try {
      // 먼저 설정 저장
      await saveConfigToServer(separatorList, stopwordList);
      // 추출 시작 + 폴링 병렬
      const [result] = await Promise.all([
        preprocessingService.extractKeywords(projectId, sessionId),
        pollProgress('separator', setExtractProgress),
      ]);
      setExtractProgress(100);
      console.log('키워드 추출 완료:', result);
      setMaxKeywordCols(result.maxKeywordCols || 0);
      await loadData();
      // step_history: 데이터 변경 발생 → 현재 step(3) 저장
      uploadService.updateStepHistory(projectId, sessionId, 3).catch(() => {});
      alert(`키워드 추출 완료: ${result.processedCount}건 처리, 최대 ${result.maxKeywordCols}개 키워드 분할 (${result.elapsedMs}ms)`);
    } catch (error) {
      console.error('키워드 추출 실패:', error);
      alert('키워드 추출에 실패했습니다.');
    } finally {
      setExtracting(false);
      setExtractProgress(0);
    }
  };

  // ===== 1글자 제거 (병렬 처리 + 진행률 폴링) =====
  const handleRemoveSingleChar = async () => {
    if (isViewer) return;
    setRemovingSingle(true);
    setSingleCharProgress(0);
    try {
      const [result] = await Promise.all([
        preprocessingService.removeSingleChar(projectId, sessionId),
        pollProgress('singlechar', setSingleCharProgress),
      ]);
      setSingleCharProgress(100);
      console.log('1글자 제거 완료:', result);
      await loadData();
      // step_history: 데이터 변경 발생 → 현재 step(3) 저장
      uploadService.updateStepHistory(projectId, sessionId, 3).catch(() => {});
      alert(`1글자 제거 완료: ${result.removedCount}건 제거 (${result.elapsedMs}ms)`);
    } catch (error) {
      console.error('1글자 제거 실패:', error);
      alert('1글자 제거에 실패했습니다.');
    } finally {
      setRemovingSingle(false);
      setSingleCharProgress(0);
    }
  };

  // ===== 완료 =====
  const handleComplete = async () => {
    try {
      // step_history: 완료 → 다음 step(4) 저장
      await uploadService.updateStepHistory(projectId, sessionId, 4);
    } catch (e) {
      console.error('step_history 업데이트 실패:', e);
    }
    navigate(`/projects/${projectId}/sessions/${sessionId}/transform`);
  };

  // ===== 결과 테이블 컬럼 계산 =====
  // resultData 자체에서 c0, c1, ... 키를 감지하여 컬럼 구성
  // (maxKeywordCols 상태에만 의존하지 않고, 실제 데이터 기반으로 계산)
  const resultColumns = useMemo(() => {
    const cols = [];
    if (sessionInfo.costCenterColumn) cols.push(sessionInfo.costCenterColumn);
    if (sessionInfo.supplierColumn) cols.push(sessionInfo.supplierColumn);

    // 실제 데이터에서 c0, c1, c2... 키 존재 여부 감지
    let detectedMax = -1;
    for (const row of resultData) {
      for (const key of Object.keys(row)) {
        const match = key.match(/^c(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > detectedMax) detectedMax = num;
        }
      }
      if (detectedMax >= 0) break; // 첫 번째 행에서 패턴 확인되면 충분
    }

    // maxKeywordCols 상태값과 데이터 기반 값 중 큰 쪽 사용
    const effectiveMax = Math.max(detectedMax + 1, maxKeywordCols);

    if (effectiveMax > 0) {
      for (let i = 0; i < effectiveMax; i++) {
        cols.push(`c${i}`);
      }
    } else if (sessionInfo.targetColumn) {
      cols.push(sessionInfo.targetColumn);
    }
    return cols;
  }, [resultData, maxKeywordCols, sessionInfo.costCenterColumn, sessionInfo.supplierColumn, sessionInfo.targetColumn]);

  // ===== 금액 포맷 =====
  const formatAmount = (value) => {
    if (value === null || value === undefined) return '-';
    return Number(value).toLocaleString();
  };

  // ===== AdvancedTable 컬럼 빌드 =====
  const targetColumns = useMemo(() => [
    {
      key: '_rowNum',
      label: 'No',
      pinned: true,
      sortable: true,
      width: 60,
      minWidth: 50,
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      render: (row) => <span>{row._rowNum}</span>,
    },
    {
      key: sessionInfo.targetColumn || '타겟',
      label: sessionInfo.targetColumn || '타겟',
      sortable: true,
      minWidth: 100,
      render: (row) => (
        <span className="whitespace-nowrap">
          {row[sessionInfo.targetColumn] ?? ''}
        </span>
      ),
    },
  ], [sessionInfo.targetColumn]);

  // resultColumns는 이미 useMemo이므로 참조 안정적
  const resultTableColumns = useMemo(() => {
    return resultColumns.map(col => ({
      key: col,
      label: col,
      sortable: true,
      minWidth: 60,
      render: (row) => (
        <span className="whitespace-nowrap">{row[col] ?? ''}</span>
      ),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultColumns.join(',')]);

  // ===== 프론트 정렬 =====
  const sortDataFn = useCallback((data, sort) => {
    if (!sort) return data;
    const sorted = [...data];
    sorted.sort((a, b) => {
      const aVal = a[sort.field];
      const bVal = b[sort.field];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sort.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return sorted;
  }, []);

  const sortedTargetData = useMemo(() => sortDataFn(targetData, targetSort), [targetData, targetSort, sortDataFn]);
  const sortedResultData = useMemo(() => sortDataFn(resultData, resultSort), [resultData, resultSort, sortDataFn]);

  // ===== 렌더링 =====
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">

        {!isEditor && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">
                    뷰어 모드 - {editorInfo?.editorUserName || '다른 사용자'}님이 편집 중입니다
                </span>
            </div>
        )}

        {/* 상단 헤더 (고정 높이) */}
        <div className="flex-shrink-0 space-y-4 mb-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/projects">
                  <Home className="h-4 w-4" />
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/projects/${projectId}/upload`}>
                  프로젝트
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/projects/${projectId}/sessions/${sessionId}/startanalysis`}>
                  Step 2: Start Analysis
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold">
                  Step 3: Preprocessing
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* 세션 정보 카드 */}
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{sessionInfo.sessionName}</CardTitle>
                <div className="flex gap-6 text-sm text-muted-foreground">
                  <span>총 건수: <strong className="text-foreground">{formatAmount(sessionInfo.totalRowCount)}</strong></span>
                  <span>총 금액: <strong className="text-foreground">{formatAmount(sessionInfo.totalAmount)}</strong></span>
                </div>
              </div>
            </CardHeader>
            {isViewer && (
              <div className="mx-4 mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium">
                뷰어 권한: 조회만 가능합니다. 데이터 수정이 불가합니다.
              </div>
            )}
          </Card>
        </div>

        {/* 메인 콘텐츠 그리드 (남은 높이 채움) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 xl:grid-rows-[1fr] gap-4 overflow-y-auto xl:overflow-visible">

          {/* 좌측: 데이터 테이블 영역 (8/12) */}
          <div className="xl:col-span-8 min-h-[50vh] xl:min-h-0 xl:h-full flex flex-col gap-4">

            {/* 내부 그리드: 대상 테이블(5) + 결과 테이블(7) */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[1fr] gap-4">

              {/* 키워드 추출 대상 */}
              <div className="lg:col-span-5 min-h-[250px] lg:min-h-0 lg:h-full">
                <Card className="h-full flex flex-col overflow-hidden shadow-sm">
                  <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                    <CardTitle className="text-base">키워드 추출 대상</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      타겟열: <strong>{sessionInfo.targetColumn || '미설정'}</strong>
                    </p>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                      <AdvancedTable
                        columns={targetColumns}
                        data={sortedTargetData}
                        rowKey={(row) => row._id}
                        sort={targetSort}
                        onSortChange={(field, direction) => setTargetSort({ field, direction })}
                        loading={loading}
                      />
                  </CardContent>
                </Card>
              </div>

              {/* 키워드 추출 결과 */}
              <div className="lg:col-span-7 min-h-[250px] lg:min-h-0 lg:h-full">
                <Card className="h-full flex flex-col overflow-hidden shadow-sm">
                  <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                    <CardTitle className="text-base">키워드 추출 결과</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                      <AdvancedTable
                        columns={resultTableColumns}
                        data={sortedResultData}
                        rowKey={(row) => row._id}
                        sort={resultSort}
                        onSortChange={(field, direction) => setResultSort({ field, direction })}
                        loading={loading}
                      />
                  </CardContent>
                </Card>
              </div>

            </div>

            {/* 페이징 */}
            <div className="flex-shrink-0 flex items-center justify-between bg-white border rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">페이지 크기:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(0); }}>
                  <SelectTrigger className="h-7 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[50, 100, 500, 1000].map(s => (
                      <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground ml-2">
                  {totalRows > 0
                    ? `${currentPage * pageSize + 1} - ${Math.min((currentPage + 1) * pageSize, totalRows)} / 총 ${totalRows.toLocaleString()}건`
                    : '0건'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                  disabled={currentPage === 0} onClick={() => setCurrentPage(0)}>처음</Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                  disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>이전</Button>
                <span className="text-xs px-2">{currentPage + 1} / {totalPages || 1}</span>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                  disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}>다음</Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                  disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(totalPages - 1)}>마지막</Button>
              </div>
            </div>

          </div>

          {/* 우측: 컨트롤 영역 (4/12) */}
          <div className="xl:col-span-4 min-h-[40vh] xl:min-h-0 xl:h-full flex flex-col">

            {/* 설정 패널 (스크롤 가능) */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              {/* 구분자 변환 */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-bold">구분자 변환</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex gap-2">
                    <Input
                      className="h-8 text-sm"
                      placeholder="신규 구분자 입력"
                      value={newSeparator}
                      onChange={(e) => setNewSeparator(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSeparator(); } }}
                      disabled={isViewer}
                    />
                    <Button onClick={handleAddSeparator} className="bg-pink-600 hover:bg-pink-700 h-8 whitespace-nowrap" disabled={isViewer}>
                      <Plus className="h-3 w-3 mr-1" />추가
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8 whitespace-nowrap text-xs"
                      onClick={() => {
                        if (isViewer) return;
                        if (separatorList.some(s => s.value === ' ')) {
                          alert('이미 공백 구분자가 존재합니다.');
                          return;
                        }
                        const updated = [...separatorList, { value: ' ', checked: true }];
                        setSeparatorList(updated);
                        saveConfigToServer(updated, stopwordList);
                      }}
                      disabled={isViewer}
                    >
                      공백 추가
                    </Button>
                  </div>
                  <div className="border rounded-md p-2 max-h-[180px] overflow-y-auto bg-white">
                    {/* 전체 선택 */}
                    <div className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded border-b mb-1 pb-2">
                      <Checkbox
                        checked={separatorList.length > 0 && separatorCheckedSet.size === separatorList.length}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSeparatorCheckedSet(new Set(separatorList.map((_, i) => i)));
                          } else {
                            setSeparatorCheckedSet(new Set());
                          }
                        }}
                        disabled={isViewer}
                      />
                      <span className="text-xs font-semibold">전체 선택</span>
                    </div>
                    <MultiSelectCheckList
                      items={separatorList}
                      checkedSet={separatorCheckedSet}
                      onCheckedChange={handleSeparatorCheckedChange}
                      getKey={(_, i) => i}
                      renderLabel={(item) => (
                        <span className="text-xs">{item.value === ' ' ? '(공백)' : item.value}</span>
                      )}
                      disabled={isViewer}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleRemoveSeparator} disabled={isViewer}>
                    <Trash2 className="h-3 w-3 mr-1" />선택 항목 제거
                  </Button>
                </CardContent>
              </Card>

              {/* 불용어 제거 */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-bold">불용어 제거</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex gap-2">
                    <Input
                      className="h-8 text-sm"
                      placeholder="신규 불용어 입력"
                      value={newStopword}
                      onChange={(e) => setNewStopword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddStopword(); }}
                      disabled={isViewer}
                    />
                    <Button onClick={handleAddStopword} className="h-8 whitespace-nowrap" disabled={isViewer}>
                      <Plus className="h-3 w-3 mr-1" />추가
                    </Button>
                  </div>
                  <div className="border rounded-md p-2 max-h-[180px] overflow-y-auto bg-white">
                    <div className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded border-b mb-1 pb-2">
                      <Checkbox
                        checked={stopwordList.length > 0 && stopwordCheckedSet.size === stopwordList.length}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setStopwordCheckedSet(new Set(stopwordList.map((_, i) => i)));
                          } else {
                            setStopwordCheckedSet(new Set());
                          }
                        }}
                        disabled={isViewer}
                      />
                      <span className="text-xs font-semibold">전체 선택</span>
                    </div>
                    <MultiSelectCheckList
                      items={stopwordList}
                      checkedSet={stopwordCheckedSet}
                      onCheckedChange={handleStopwordCheckedChange}
                      getKey={(_, i) => i}
                      renderLabel={(item) => (
                        <span className="text-xs">{item.value}</span>
                      )}
                      disabled={isViewer}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleRemoveStopword} disabled={isViewer}>
                    <Trash2 className="h-3 w-3 mr-1" />선택 항목 제거
                  </Button>
                </CardContent>
              </Card>

              {/* 구분자 기반 키워드 추출 */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-bold">구분자 기반 키워드 추출</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  <div className="text-[11px] text-gray-500 bg-gray-50 p-2 rounded">
                    * 체크된 구분자로 타겟열 데이터를 분할하고<br />
                    * 체크된 불용어를 제거합니다.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" className="h-8" onClick={handleKeywordExtract} disabled={extracting || isViewer}>
                      {extracting ? (
                        <div className="flex items-center gap-1">
                          <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                          {extractProgress > 0 ? `${extractProgress}%` : '추출 중...'}
                        </div>
                      ) : '키워드 추출'}
                    </Button>
                    <Button size="sm" variant="secondary" className="h-8" onClick={handleRemoveSingleChar} disabled={removingSingle || isViewer}>
                      {removingSingle ? (
                        <div className="flex items-center gap-1">
                          <div className="animate-spin h-3 w-3 border-2 border-gray-500 border-t-transparent rounded-full" />
                          {singleCharProgress > 0 ? `${singleCharProgress}%` : '제거 중...'}
                        </div>
                      ) : '1글자 제거'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* NLP 기반 키워드 추출 */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-bold">NLP 기반 키워드 추출</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="text-[11px] text-pink-600 bg-pink-50 p-2 rounded">
                    * 구분자 기반으로 키워드 추출 후<br />
                    AI가 추가적으로 키워드를 분할합니다.
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={minKeywordLength}
                      onChange={(e) => setMinKeywordLength(parseInt(e.target.value) || 4)}
                      min="1"
                      max="10"
                      className="w-16 h-8 text-sm"
                      disabled={isViewer}
                    />
                    <span className="text-xs text-muted-foreground">글자 이상 키워드 자동 분할</span>
                  </div>
                  <Button
                    size="sm"
                    className="w-full bg-purple-600 hover:bg-purple-700 h-8"
                    onClick={async () => {
                      setNlpExtracting(true);
                      setNlpProgress(0);
                      try {
                        const [result] = await Promise.all([
                          preprocessingService.extractKeywordsNlp(projectId, sessionId, minKeywordLength),
                          pollProgress('nlp', setNlpProgress),
                        ]);
                        setNlpProgress(100);
                        console.log('NLP 키워드 추출 완료:', result);
                        setMaxKeywordCols(result.maxKeywordCols || maxKeywordCols);
                        await loadData();
                        // step_history: 데이터 변경 발생 → 현재 step(3) 저장
                        uploadService.updateStepHistory(projectId, sessionId, 3).catch(() => {});
                        alert(`NLP 키워드 추출 완료: ${result.processedCount}건 변경, ${result.splitCount}건 분할 (${result.elapsedMs}ms)`);
                      } catch (error) {
                        console.error('NLP 키워드 추출 실패:', error);
                        alert('NLP 키워드 추출 실패: ' + (error.response?.data?.message || error.message));
                      } finally {
                        setNlpExtracting(false);
                        setNlpProgress(0);
                      }
                    }}
                    disabled={nlpExtracting || isViewer}
                  >
                    {nlpExtracting ? (
                      <div className="flex items-center gap-1">
                        <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                        {nlpProgress > 0 ? `${nlpProgress}%` : '추출 중...'}
                      </div>
                    ) : '키워드 추출'}
                  </Button>
                </CardContent>
              </Card>

            </div>

            {/* 완료 버튼 (하단 고정) */}
            <div className="pt-3 mt-auto flex-shrink-0 z-20 bg-gray-50 pb-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold"
                onClick={handleComplete}
                disabled={isViewer}
              >
                완료 → Step 4: Transform
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default PreprocessingPage;
