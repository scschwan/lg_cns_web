// frontend/src/pages/transform/DataTransformPage.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Search, ChevronDown, ChevronUp, Settings, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import transformService from '../../services/transformService';
import uploadService from '../../services/uploadService';

/**
 * 가로 스크롤 테이블 래퍼 (HorizontalScrollTable 패턴)
 */
function HorizontalScrollTable({ children, className = "" }) {
  return (
    <div className={`flex-1 w-full min-h-0 overflow-auto ${className}`}>
      <div className="min-w-max h-full">
        {children}
      </div>
    </div>
  );
}

/**
 * 페이징 컴포넌트
 */
function Pagination({ currentPage, totalPages, totalCount, pageSize, onPageChange, onPageSizeChange }) {
  if (totalCount === 0) return null;
  const startRow = currentPage * pageSize + 1;
  const endRow = Math.min((currentPage + 1) * pageSize, totalCount);

  return (
    <div className="p-3 border-t bg-white flex-shrink-0">
      <div className="flex items-center justify-between text-xs">
        <div className="text-muted-foreground hidden sm:block">
          {startRow} - {endRow} / 총 {totalCount.toLocaleString()}건
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20개씩</SelectItem>
              <SelectItem value="50">50개씩</SelectItem>
              <SelectItem value="100">100개씩</SelectItem>
              <SelectItem value="500">500개씩</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8 px-2"
              onClick={() => onPageChange(0)} disabled={currentPage === 0}>처음</Button>
            <Button variant="outline" size="sm" className="h-8 px-2"
              onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 0}>이전</Button>
            <span className="flex items-center px-2 text-xs font-medium">
              {currentPage + 1} / {totalPages || 1}
            </span>
            <Button variant="outline" size="sm" className="h-8 px-2"
              onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages - 1}>다음</Button>
            <Button variant="outline" size="sm" className="h-8 px-2"
              onClick={() => onPageChange(totalPages - 1)} disabled={currentPage >= totalPages - 1}>마지막</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataTransformPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  // ===== 세션 정보 =====
  const [sessionInfo, setSessionInfo] = useState({ sessionName: '', totalRecords: 0 });

  // ===== 금액 단위 =====
  const [amountUnit, setAmountUnit] = useState('원');
  const amountDivisor = { '원': 1, '천원': 1000, '백만원': 1000000, '억원': 100000000 };

  // ===== 키워드 통계 =====
  const [keywordStats, setKeywordStats] = useState([]);
  const [statsSortField, setStatsSortField] = useState('count');
  const [statsSortDir, setStatsSortDir] = useState('desc');
  const [selectedStatKeyword, setSelectedStatKeyword] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // ===== 원본 데이터 테이블 =====
  const [originalData, setOriginalData] = useState({ columns: [], data: [], totalCount: 0, totalPages: 0 });
  const [origPage, setOrigPage] = useState(0);
  const [origPageSize, setOrigPageSize] = useState(100);
  const [origKeywordFilter, setOrigKeywordFilter] = useState(null);
  const [origLoading, setOrigLoading] = useState(false);
  const [isOriginalCollapsed, setIsOriginalCollapsed] = useState(false);

  // ===== 검색 결과 데이터 테이블 =====
  const [searchResultData, setSearchResultData] = useState({ columns: [], data: [], totalCount: 0, totalPages: 0 });
  const [searchPage, setSearchPage] = useState(0);
  const [searchPageSize, setSearchPageSize] = useState(100);
  const [searchKeywordFilter, setSearchKeywordFilter] = useState(null);
  const [searchDataLoading, setSearchDataLoading] = useState(false);

  // ===== 키워드 변환 탭 =====
  const [activeTab, setActiveTab] = useState('stats');
  const [searchMethod, setSearchMethod] = useState('input');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedKeywordFromStats, setSelectedKeywordFromStats] = useState('');
  const [mergeSearchResults, setMergeSearchResults] = useState([]);
  const [mergeCheckedSet, setMergeCheckedSet] = useState(new Set());
  const [toKeyword, setToKeyword] = useState('');
  const [mergeLoading, setMergeLoading] = useState(false);
  const [selectedMergeKeyword, setSelectedMergeKeyword] = useState(null);

  // ===== 클러스터링 조건 =====
  const [clusteringOptions, setClusteringOptions] = useState({ supplier: true, costCenter: true });

  // ===== 정렬된 키워드 통계 =====
  const sortedKeywordStats = useMemo(() => {
    const sorted = [...keywordStats];
    sorted.sort((a, b) => {
      let aVal, bVal;
      if (statsSortField === 'keyword') {
        aVal = a.keyword || '';
        bVal = b.keyword || '';
        return statsSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (statsSortField === 'count') {
        aVal = a.count || 0;
        bVal = b.count || 0;
      } else {
        aVal = a.totalAmount || 0;
        bVal = b.totalAmount || 0;
      }
      return statsSortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [keywordStats, statsSortField, statsSortDir]);

  // ===== 금액 포맷 =====
  const formatAmount = useCallback((amount) => {
    if (amount == null || isNaN(amount)) return '0';
    const value = amount / amountDivisor[amountUnit];
    if (amountUnit === '원') {
      return Math.round(value).toLocaleString();
    }
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }, [amountUnit]);

  // ===== 정렬 토글 =====
  const handleStatsSort = (field) => {
    if (statsSortField === field) {
      setStatsSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setStatsSortField(field);
      setStatsSortDir('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (statsSortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return statsSortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // ===== 데이터 로드 =====
  const loadSessionInfo = async () => {
    try {
      const session = await uploadService.getSession(projectId, sessionId);
      setSessionInfo({
        sessionName: session.sessionName || sessionId,
        totalRecords: session.totalRowCount || 0,
      });
    } catch (error) {
      console.error('세션 정보 로드 실패:', error);
    }
  };

  const loadKeywordStats = async () => {
    try {
      setStatsLoading(true);
      const stats = await transformService.getKeywordStats(projectId, sessionId);
      setKeywordStats(stats);
    } catch (error) {
      console.error('키워드 통계 로드 실패:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadOriginalData = async (page, size, keyword) => {
    try {
      setOrigLoading(true);
      const result = await transformService.getOriginalData(projectId, sessionId, page, size, keyword);
      setOriginalData(result);
    } catch (error) {
      console.error('원본 데이터 로드 실패:', error);
    } finally {
      setOrigLoading(false);
    }
  };

  const loadSearchResultData = async (page, size, keyword) => {
    if (!keyword) {
      setSearchResultData({ columns: [], data: [], totalCount: 0, totalPages: 0 });
      return;
    }
    try {
      setSearchDataLoading(true);
      const result = await transformService.getSearchData(projectId, sessionId, page, size, keyword);
      setSearchResultData(result);
    } catch (error) {
      console.error('검색 결과 데이터 로드 실패:', error);
    } finally {
      setSearchDataLoading(false);
    }
  };

  // ===== 초기 로드 =====
  useEffect(() => {
    loadSessionInfo();
    loadKeywordStats();
    loadOriginalData(0, origPageSize, null);
  }, [projectId, sessionId]);

  // ===== 원본 데이터 페이징 변경 =====
  const handleOrigPageChange = (page) => {
    setOrigPage(page);
    loadOriginalData(page, origPageSize, origKeywordFilter);
  };
  const handleOrigPageSizeChange = (size) => {
    setOrigPageSize(size);
    setOrigPage(0);
    loadOriginalData(0, size, origKeywordFilter);
  };

  // ===== 검색 결과 데이터 페이징 변경 =====
  const handleSearchPageChange = (page) => {
    setSearchPage(page);
    loadSearchResultData(page, searchPageSize, searchKeywordFilter);
  };
  const handleSearchPageSizeChange = (size) => {
    setSearchPageSize(size);
    setSearchPage(0);
    loadSearchResultData(0, size, searchKeywordFilter);
  };

  // ===== 키워드 통계 클릭 → 원본 데이터 필터링 =====
  const handleStatKeywordClick = (keyword) => {
    if (selectedStatKeyword === keyword) {
      setSelectedStatKeyword(null);
      setOrigKeywordFilter(null);
      setOrigPage(0);
      loadOriginalData(0, origPageSize, null);
    } else {
      setSelectedStatKeyword(keyword);
      setOrigKeywordFilter(keyword);
      setOrigPage(0);
      loadOriginalData(0, origPageSize, keyword);
    }
  };

  // ===== 키워드 변환 탭: 검색 =====
  const handleMergeSearch = async () => {
    const keyword = searchMethod === 'input' ? searchKeyword : selectedKeywordFromStats;
    if (!keyword || !keyword.trim()) {
      alert('검색할 키워드를 입력하거나 선택해주세요.');
      return;
    }
    try {
      setMergeLoading(true);
      const results = await transformService.searchKeywords(projectId, sessionId, keyword.trim());
      setMergeSearchResults(results);
      setMergeCheckedSet(new Set());
      setSelectedMergeKeyword(null);
    } catch (error) {
      console.error('키워드 검색 실패:', error);
      alert('키워드 검색에 실패했습니다.');
    } finally {
      setMergeLoading(false);
    }
  };

  // ===== 키워드 변환 검색결과 클릭 → 검색 결과 데이터 테이블에 출력 =====
  const handleMergeResultClick = (keyword) => {
    setSelectedMergeKeyword(keyword);
    setSearchKeywordFilter(keyword);
    setSearchPage(0);
    loadSearchResultData(0, searchPageSize, keyword);
  };

  // ===== 키워드 변환 체크박스 =====
  const handleMergeCheck = (keyword) => {
    setMergeCheckedSet(prev => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  };

  const handleMergeCheckAll = (checked) => {
    if (checked) {
      setMergeCheckedSet(new Set(mergeSearchResults.map(r => r.keyword)));
    } else {
      setMergeCheckedSet(new Set());
    }
  };

  // ===== 키워드 변환 실행 =====
  const handleReplaceKeywords = async () => {
    if (mergeCheckedSet.size === 0) {
      alert('변환할 키워드를 선택해주세요.');
      return;
    }
    if (!toKeyword.trim()) {
      alert('변환 키워드를 입력해주세요.');
      return;
    }

    const fromKeywords = Array.from(mergeCheckedSet);
    try {
      setMergeLoading(true);
      const result = await transformService.replaceKeywords(
        projectId, sessionId, fromKeywords, toKeyword.trim()
      );
      alert(`키워드 변환 완료: ${result.modifiedCount}건 변경 (${result.elapsedMs}ms)`);

      // step_history: 데이터 변경 → 현재 step(4) 저장
      uploadService.updateStepHistory(projectId, sessionId, 4).catch(() => {});

      // 통계 재조회
      await loadKeywordStats();

      // 변환 검색 재수행
      const kw = searchMethod === 'input' ? searchKeyword : selectedKeywordFromStats;
      if (kw && kw.trim()) {
        const results = await transformService.searchKeywords(projectId, sessionId, kw.trim());
        setMergeSearchResults(results);
        setMergeCheckedSet(new Set());
      }

      // 원본 데이터 재조회
      loadOriginalData(origPage, origPageSize, origKeywordFilter);

      // 검색 결과 데이터 재조회
      if (searchKeywordFilter) {
        loadSearchResultData(searchPage, searchPageSize, searchKeywordFilter);
      }

      setToKeyword('');
    } catch (error) {
      console.error('키워드 변환 실패:', error);
      alert('키워드 변환에 실패했습니다.');
    } finally {
      setMergeLoading(false);
    }
  };

  // ===== 완료 =====
  const handleComplete = async () => {
    try {
      await uploadService.updateStepHistory(projectId, sessionId, 5);
    } catch (e) {
      console.error('step_history 업데이트 실패:', e);
    }
    navigate(`/projects/${projectId}/sessions/${sessionId}/clustering`);
  };

  // ===== 데이터 테이블 렌더 =====
  const renderDataTable = (data, columns) => {
    if (!data || data.length === 0) return null;
    return (
      <Table>
        <TableHeader className="bg-gray-100 sticky top-0 z-10">
          <TableRow>
            <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100 w-[60px]">No</TableHead>
            {columns.filter(c => c !== '_id' && c !== 'row_number').map(col => (
              <TableHead key={col} className="font-semibold text-xs whitespace-nowrap bg-gray-100">
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow key={row._id || idx} className="hover:bg-muted/50">
              <TableCell className="text-xs whitespace-nowrap text-center">{row.row_number || idx + 1}</TableCell>
              {columns.filter(c => c !== '_id' && c !== 'row_number').map(col => (
                <TableCell key={col} className="text-xs whitespace-nowrap">
                  {row[col] != null ? String(row[col]) : ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">

        {/* 상단 헤더 */}
        <div className="flex-shrink-0 space-y-4 mb-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/projects">
                  <Home className="h-4 w-4" />
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/projects/${projectId}/upload`}>프로젝트</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold">Step 4: Data Transform</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{sessionInfo.sessionName}</span>
                <div className="text-sm font-normal text-muted-foreground">
                  총 {sessionInfo.totalRecords.toLocaleString()}건
                </div>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 메인 콘텐츠 그리드 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측: 테이블 영역 (8/12) */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 1. 원본 데이터 테이블 */}
            <Card className="flex-shrink-0 transition-all duration-300 shadow-sm">
              <CardHeader
                className="py-3 px-4 border-b bg-white cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setIsOriginalCollapsed(!isOriginalCollapsed)}
              >
                <CardTitle className="text-base flex items-center justify-between">
                  <span>
                    원본 데이터
                    {origKeywordFilter && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        필터: {origKeywordFilter}
                      </Badge>
                    )}
                    <span className="text-xs font-normal text-gray-500 ml-2">
                      ({originalData.totalCount?.toLocaleString()}건, 클릭하여 {isOriginalCollapsed ? '펼치기' : '접기'})
                    </span>
                  </span>
                  {isOriginalCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </CardTitle>
              </CardHeader>

              {!isOriginalCollapsed && (
                <>
                  <CardContent className="p-0">
                    <HorizontalScrollTable className="max-h-[250px]">
                      {origLoading ? (
                        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                          데이터 로딩 중...
                        </div>
                      ) : originalData.data.length === 0 ? (
                        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                          데이터가 없습니다
                        </div>
                      ) : (
                        renderDataTable(originalData.data, originalData.columns)
                      )}
                    </HorizontalScrollTable>
                  </CardContent>
                  <Pagination
                    currentPage={origPage}
                    totalPages={originalData.totalPages}
                    totalCount={originalData.totalCount}
                    pageSize={origPageSize}
                    onPageChange={handleOrigPageChange}
                    onPageSizeChange={handleOrigPageSizeChange}
                  />
                </>
              )}
            </Card>

            {/* 2. 검색 결과 데이터 테이블 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <CardTitle className="text-base">
                  검색 결과 데이터
                  {searchKeywordFilter && (
                    <span className="text-xs font-normal text-muted-foreground ml-2">
                      (키워드: <Badge variant="outline" className="text-[10px]">{searchKeywordFilter}</Badge>
                      , {searchResultData.totalCount?.toLocaleString()}건)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>

              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                {searchResultData.data.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground min-h-[120px]">
                    {searchDataLoading ? '데이터 로딩 중...' : '우측 키워드 변환에서 키워드를 검색하고 결과를 선택해주세요'}
                  </div>
                ) : (
                  <HorizontalScrollTable>
                    {renderDataTable(searchResultData.data, searchResultData.columns)}
                  </HorizontalScrollTable>
                )}
              </CardContent>

              {searchResultData.totalCount > 0 && (
                <Pagination
                  currentPage={searchPage}
                  totalPages={searchResultData.totalPages}
                  totalCount={searchResultData.totalCount}
                  pageSize={searchPageSize}
                  onPageChange={handleSearchPageChange}
                  onPageSizeChange={handleSearchPageSizeChange}
                />
              )}
            </Card>
          </div>

          {/* 우측: 키워드 통계 + 변환 패널 (4/12) */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="stats">키워드 통계</TabsTrigger>
                  <TabsTrigger value="merge">키워드 변환</TabsTrigger>
                </TabsList>

                {/* ===== 키워드 통계 탭 ===== */}
                <TabsContent value="stats" className="mt-3">
                  <Card>
                    <CardHeader className="py-3 border-b">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold">
                          키워드 통계 ({keywordStats.length}건)
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" className="h-7 px-2"
                            onClick={loadKeywordStats} disabled={statsLoading}>
                            <RefreshCw className={`h-3 w-3 ${statsLoading ? 'animate-spin' : ''}`} />
                          </Button>
                          <Select value={amountUnit} onValueChange={setAmountUnit}>
                            <SelectTrigger className="w-[80px] h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="원">원</SelectItem>
                              <SelectItem value="천원">천원</SelectItem>
                              <SelectItem value="백만원">백만원</SelectItem>
                              <SelectItem value="억원">억원</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[calc(100vh-500px)] custom-scrollbar">
                        <Table>
                          <TableHeader className="bg-gray-100 sticky top-0 z-10">
                            <TableRow>
                              <TableHead className="font-semibold text-xs w-[40px] text-center bg-gray-100">순위</TableHead>
                              <TableHead
                                className="font-semibold text-xs bg-gray-100 cursor-pointer select-none"
                                onClick={() => handleStatsSort('keyword')}
                              >
                                <div className="flex items-center">키워드<SortIcon field="keyword" /></div>
                              </TableHead>
                              <TableHead
                                className="font-semibold text-xs text-right bg-gray-100 cursor-pointer select-none"
                                onClick={() => handleStatsSort('count')}
                              >
                                <div className="flex items-center justify-end">Count<SortIcon field="count" /></div>
                              </TableHead>
                              <TableHead
                                className="font-semibold text-xs text-right bg-gray-100 cursor-pointer select-none"
                                onClick={() => handleStatsSort('totalAmount')}
                              >
                                <div className="flex items-center justify-end">합계({amountUnit})<SortIcon field="totalAmount" /></div>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedKeywordStats.map((row, idx) => (
                              <TableRow
                                key={row.keyword}
                                className={`cursor-pointer hover:bg-blue-50 ${
                                  selectedStatKeyword === row.keyword ? 'bg-blue-100' : ''
                                }`}
                                onClick={() => handleStatKeywordClick(row.keyword)}
                              >
                                <TableCell className="text-xs text-center">{idx + 1}</TableCell>
                                <TableCell className="text-xs">
                                  <Badge variant="outline" className="text-[10px] font-medium">
                                    {row.keyword}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {row.count.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {formatAmount(row.totalAmount)}
                                </TableCell>
                              </TableRow>
                            ))}
                            {keywordStats.length === 0 && !statsLoading && (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">
                                  키워드 통계가 없습니다
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ===== 키워드 변환 탭 ===== */}
                <TabsContent value="merge" className="mt-3">
                  <Card>
                    <CardHeader className="py-3 border-b">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <RefreshCw className="h-4 w-4" />
                        키워드 변환
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">

                      {/* 검색 방법 선택 */}
                      <div className="flex gap-2 mb-3">
                        <Button size="sm"
                          variant={searchMethod === 'input' ? 'default' : 'outline'}
                          className="flex-1 h-8 text-xs"
                          onClick={() => setSearchMethod('input')}
                        >직접 입력</Button>
                        <Button size="sm"
                          variant={searchMethod === 'select' ? 'default' : 'outline'}
                          className="flex-1 h-8 text-xs"
                          onClick={() => setSearchMethod('select')}
                        >통계에서 선택</Button>
                      </div>

                      {/* 검색 입력 */}
                      {searchMethod === 'input' ? (
                        <div className="flex gap-2">
                          <Input
                            className="h-8 text-sm"
                            placeholder="키워드 입력 (like 검색)"
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleMergeSearch(); }}
                          />
                          <Button size="sm" className="h-8 whitespace-nowrap"
                            onClick={handleMergeSearch} disabled={mergeLoading}>
                            <Search className="h-3 w-3 mr-1" />검색
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Select value={selectedKeywordFromStats} onValueChange={setSelectedKeywordFromStats}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="키워드 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {keywordStats.map((stat) => (
                                <SelectItem key={stat.keyword} value={stat.keyword}>
                                  {stat.keyword} ({stat.count})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-8 whitespace-nowrap"
                            onClick={handleMergeSearch} disabled={mergeLoading}>
                            <Search className="h-3 w-3 mr-1" />검색
                          </Button>
                        </div>
                      )}

                      {/* 검색 결과 (체크박스 포함) */}
                      <div>
                        <label className="text-xs font-semibold mb-2 block">
                          검색 결과 ({mergeSearchResults.length}건)
                        </label>
                        <div className="border rounded-md p-2 space-y-1 max-h-[250px] overflow-y-auto bg-white">
                          {mergeSearchResults.length === 0 ? (
                            <div className="text-xs text-muted-foreground text-center py-4">
                              키워드를 검색해주세요
                            </div>
                          ) : (
                            <Table>
                              <TableHeader className="bg-gray-50 sticky top-0">
                                <TableRow>
                                  <TableHead className="text-xs h-7 py-1 w-[30px]">
                                    <Checkbox
                                      checked={mergeCheckedSet.size === mergeSearchResults.length && mergeSearchResults.length > 0}
                                      onCheckedChange={handleMergeCheckAll}
                                    />
                                  </TableHead>
                                  <TableHead className="text-xs h-7 py-1">키워드</TableHead>
                                  <TableHead className="text-xs h-7 py-1 text-right">Count</TableHead>
                                  <TableHead className="text-xs h-7 py-1 text-right">합계({amountUnit})</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {mergeSearchResults.map((result) => (
                                  <TableRow
                                    key={result.keyword}
                                    className={`cursor-pointer hover:bg-blue-50 ${
                                      selectedMergeKeyword === result.keyword ? 'bg-blue-100' : ''
                                    }`}
                                    onClick={() => handleMergeResultClick(result.keyword)}
                                  >
                                    <TableCell className="text-xs py-1"
                                      onClick={(e) => e.stopPropagation()}>
                                      <Checkbox
                                        checked={mergeCheckedSet.has(result.keyword)}
                                        onCheckedChange={() => handleMergeCheck(result.keyword)}
                                      />
                                    </TableCell>
                                    <TableCell className="text-xs py-1">
                                      <Badge variant="outline" className="text-[10px]">
                                        {result.keyword}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs py-1 text-right">
                                      {result.count}
                                    </TableCell>
                                    <TableCell className="text-xs py-1 text-right">
                                      {formatAmount(result.totalAmount)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      </div>

                      {/* 변환 키워드 입력 */}
                      <div>
                        <label className="text-xs font-semibold mb-2 block">
                          변환 키워드
                        </label>
                        <Input
                          className="h-8 text-sm"
                          placeholder="변환할 키워드를 입력하세요"
                          value={toKeyword}
                          onChange={(e) => setToKeyword(e.target.value)}
                        />
                      </div>

                      {/* 변환 실행 버튼 */}
                      <Button
                        className="w-full bg-purple-600 hover:bg-purple-700 h-10 font-semibold"
                        onClick={handleReplaceKeywords}
                        disabled={mergeCheckedSet.size === 0 || mergeLoading}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        키워드 변환 실행 ({mergeCheckedSet.size}건 선택)
                      </Button>

                      <div className="text-[11px] text-muted-foreground bg-muted p-2 rounded">
                        검색 후 체크박스로 키워드 선택 → 변환 키워드 입력 → 변환 실행
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* 클러스터링 조건 설정 */}
              <Card>
                <CardHeader className="py-3 border-b">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    클러스터링 조건 설정
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="supplier"
                      checked={clusteringOptions.supplier}
                      onCheckedChange={(checked) =>
                        setClusteringOptions(prev => ({ ...prev, supplier: !!checked }))
                      }
                    />
                    <Label htmlFor="supplier" className="text-sm cursor-pointer">공급업체명</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="costCenter"
                      checked={clusteringOptions.costCenter}
                      onCheckedChange={(checked) =>
                        setClusteringOptions(prev => ({ ...prev, costCenter: !!checked }))
                      }
                    />
                    <Label htmlFor="costCenter" className="text-sm cursor-pointer">코스트센터명</Label>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 완료 버튼 */}
            <div className="pt-3 mt-auto flex-shrink-0 z-20 bg-gray-50 pb-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold"
                onClick={handleComplete}
              >
                완료 → Step 5: Clustering
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DataTransformPage;
