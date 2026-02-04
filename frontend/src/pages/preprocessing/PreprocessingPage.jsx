// frontend/src/pages/preprocessing/PreprocessingPage.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Plus, Trash2 } from 'lucide-react';
import preprocessingService from '../../services/preprocessingService';

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
function MultiSelectCheckList({ items, checkedSet, onCheckedChange, renderLabel, getKey, className = '' }) {
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
  const navigate = useNavigate();

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
  const [removingSingle, setRemovingSingle] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

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
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await preprocessingService.getConfig(projectId, sessionId);
        if (config.separators) {
          setSeparatorList(config.separators);
          const checkedSet = new Set();
          config.separators.forEach((s, i) => {
            if (s.checked) checkedSet.add(i);
          });
          setSeparatorCheckedSet(checkedSet);
        }
        if (config.stopwords) {
          setStopwordList(config.stopwords);
          const checkedSet = new Set();
          config.stopwords.forEach((s, i) => {
            if (s.checked) checkedSet.add(i);
          });
          setStopwordCheckedSet(checkedSet);
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
  const saveConfigToServer = useCallback(async (sepList, sepChecked, swList, swChecked) => {
    setSavingConfig(true);
    try {
      const separators = sepList.map((s, i) => ({
        value: s.value,
        checked: sepChecked.has(i),
      }));
      const stopwords = swList.map((s, i) => ({
        value: s.value,
        checked: swChecked.has(i),
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
    if (newSeparator.trim()) {
      const updated = [...separatorList, { value: newSeparator.trim(), checked: true }];
      const newChecked = new Set(separatorCheckedSet);
      newChecked.add(updated.length - 1);
      setSeparatorList(updated);
      setSeparatorCheckedSet(newChecked);
      setNewSeparator('');
      saveConfigToServer(updated, newChecked, stopwordList, stopwordCheckedSet);
    }
  };

  const handleRemoveSeparator = () => {
    if (separatorCheckedSet.size === 0) {
      alert('제거할 항목을 선택해주세요.');
      return;
    }
    const remaining = separatorList.filter((_, i) => !separatorCheckedSet.has(i));
    setSeparatorList(remaining);
    const newChecked = new Set();
    remaining.forEach((s, i) => {
      if (s.checked) newChecked.add(i);
    });
    setSeparatorCheckedSet(newChecked);
    saveConfigToServer(remaining, newChecked, stopwordList, stopwordCheckedSet);
  };

  const handleSeparatorCheckedChange = (newCheckedSet) => {
    setSeparatorCheckedSet(newCheckedSet);
    // 자동 저장 (체크 상태 변경 시)
    saveConfigToServer(separatorList, newCheckedSet, stopwordList, stopwordCheckedSet);
  };

  // ===== 불용어 핸들러 =====
  const handleAddStopword = () => {
    if (newStopword.trim()) {
      const updated = [...stopwordList, { value: newStopword.trim(), checked: true }];
      const newChecked = new Set(stopwordCheckedSet);
      newChecked.add(updated.length - 1);
      setStopwordList(updated);
      setStopwordCheckedSet(newChecked);
      setNewStopword('');
      saveConfigToServer(separatorList, separatorCheckedSet, updated, newChecked);
    }
  };

  const handleRemoveStopword = () => {
    if (stopwordCheckedSet.size === 0) {
      alert('제거할 항목을 선택해주세요.');
      return;
    }
    const remaining = stopwordList.filter((_, i) => !stopwordCheckedSet.has(i));
    setStopwordList(remaining);
    const newChecked = new Set();
    remaining.forEach((s, i) => {
      if (s.checked) newChecked.add(i);
    });
    setStopwordCheckedSet(newChecked);
    saveConfigToServer(separatorList, separatorCheckedSet, remaining, newChecked);
  };

  const handleStopwordCheckedChange = (newCheckedSet) => {
    setStopwordCheckedSet(newCheckedSet);
    saveConfigToServer(separatorList, separatorCheckedSet, stopwordList, newCheckedSet);
  };

  // ===== 키워드 추출 =====
  const handleKeywordExtract = async () => {
    setExtracting(true);
    try {
      // 먼저 설정 저장
      await saveConfigToServer(separatorList, separatorCheckedSet, stopwordList, stopwordCheckedSet);
      const result = await preprocessingService.extractKeywords(projectId, sessionId);
      console.log('키워드 추출 완료:', result);
      setMaxKeywordCols(result.maxKeywordCols || 0);
      // 데이터 새로 로드
      await loadData();
      alert(`키워드 추출 완료: ${result.processedCount}건 처리, 최대 ${result.maxKeywordCols}개 키워드 분할 (${result.elapsedMs}ms)`);
    } catch (error) {
      console.error('키워드 추출 실패:', error);
      alert('키워드 추출에 실패했습니다.');
    } finally {
      setExtracting(false);
    }
  };

  // ===== 1글자 제거 =====
  const handleRemoveSingleChar = async () => {
    setRemovingSingle(true);
    try {
      const result = await preprocessingService.removeSingleChar(projectId, sessionId);
      console.log('1글자 제거 완료:', result);
      await loadData();
      alert(`1글자 제거 완료: ${result.removedCount}건 제거 (${result.elapsedMs}ms)`);
    } catch (error) {
      console.error('1글자 제거 실패:', error);
      alert('1글자 제거에 실패했습니다.');
    } finally {
      setRemovingSingle(false);
    }
  };

  // ===== 완료 =====
  const handleComplete = () => {
    navigate(`/projects/${projectId}/sessions/${sessionId}/transform`);
  };

  // ===== 결과 테이블 컬럼 계산 =====
  const resultColumns = [];
  if (sessionInfo.costCenterColumn) resultColumns.push(sessionInfo.costCenterColumn);
  if (sessionInfo.supplierColumn) resultColumns.push(sessionInfo.supplierColumn);
  // 키워드 추출 전에는 타겟열 표시, 추출 후에는 c0, c1... 표시
  if (maxKeywordCols > 0) {
    for (let i = 0; i < maxKeywordCols; i++) {
      resultColumns.push(`c${i}`);
    }
  } else if (sessionInfo.targetColumn) {
    resultColumns.push(sessionInfo.targetColumn);
  }

  // ===== 금액 포맷 =====
  const formatAmount = (value) => {
    if (value === null || value === undefined) return '-';
    return Number(value).toLocaleString();
  };

  // ===== 렌더링 =====
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">

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
          </Card>
        </div>

        {/* 메인 콘텐츠 그리드 (남은 높이 채움) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측: 데이터 테이블 영역 (8/12) */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 내부 그리드: 대상 테이블(5) + 결과 테이블(7) */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">

              {/* 키워드 추출 대상 */}
              <div className="lg:col-span-5 h-full min-h-0">
                <Card className="h-full flex flex-col overflow-hidden shadow-sm">
                  <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                    <CardTitle className="text-base">키워드 추출 대상</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      타겟열: <strong>{sessionInfo.targetColumn || '미설정'}</strong>
                    </p>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 relative min-h-0">
                    <div className="absolute inset-0 overflow-auto custom-scrollbar">
                      {loading ? (
                        <div className="flex items-center justify-center h-32">
                          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                        </div>
                      ) : (
                        <Table>
                          <TableHeader className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                            <TableRow>
                              <TableHead className="font-semibold text-xs w-[60px] text-center bg-gray-100">No</TableHead>
                              <TableHead className="font-semibold text-xs bg-gray-100">
                                {sessionInfo.targetColumn || '타겟'}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {targetData.map((row) => (
                              <TableRow key={row._id} className="hover:bg-muted/50">
                                <TableCell className="text-xs text-center">{row._rowNum}</TableCell>
                                <TableCell className="text-xs">
                                  {row[sessionInfo.targetColumn] ?? ''}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 키워드 추출 결과 */}
              <div className="lg:col-span-7 h-full min-h-0">
                <Card className="h-full flex flex-col overflow-hidden shadow-sm">
                  <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                    <CardTitle className="text-base">키워드 추출 결과</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 relative min-h-0">
                    <div className="absolute inset-0 overflow-auto custom-scrollbar">
                      {loading ? (
                        <div className="flex items-center justify-center h-32">
                          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                        </div>
                      ) : (
                        <Table>
                          <TableHeader className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                            <TableRow>
                              {resultColumns.map((col) => (
                                <TableHead key={col} className="font-semibold text-xs whitespace-nowrap bg-gray-100">
                                  {col}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {resultData.map((row) => (
                              <TableRow key={row._id} className="hover:bg-muted/50">
                                {resultColumns.map((col) => (
                                  <TableCell key={col} className="text-xs whitespace-nowrap">
                                    {row[col] ?? ''}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
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
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">

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
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddSeparator(); }}
                    />
                    <Button onClick={handleAddSeparator} className="bg-pink-600 hover:bg-pink-700 h-8 whitespace-nowrap">
                      <Plus className="h-3 w-3 mr-1" />추가
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
                    />
                  </div>
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleRemoveSeparator}>
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
                    />
                    <Button onClick={handleAddStopword} className="h-8 whitespace-nowrap">
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
                    />
                  </div>
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleRemoveStopword}>
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
                    <Button size="sm" className="h-8" onClick={handleKeywordExtract} disabled={extracting}>
                      {extracting ? (
                        <div className="flex items-center gap-1">
                          <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                          추출 중...
                        </div>
                      ) : '키워드 추출'}
                    </Button>
                    <Button size="sm" variant="secondary" className="h-8" onClick={handleRemoveSingleChar} disabled={removingSingle}>
                      {removingSingle ? (
                        <div className="flex items-center gap-1">
                          <div className="animate-spin h-3 w-3 border-2 border-gray-500 border-t-transparent rounded-full" />
                          제거 중...
                        </div>
                      ) : '1글자 제거'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* 완료 버튼 (하단 고정) */}
            <div className="pt-3 mt-auto flex-shrink-0 z-20 bg-gray-50 pb-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold"
                onClick={handleComplete}
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
