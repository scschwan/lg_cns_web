// frontend/src/pages/startAnalysis/StartAnalysisPage.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Search, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import uploadService from '../../services/uploadService';

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
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export default function StartAnalysisPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  // ===== 상태 관리 =====
  const [sessionInfo, setSessionInfo] = useState({
    sessionName: '',
    totalRecords: 0,
    totalAmount: 0,
  });
  const [fileInfo, setFileInfo] = useState(null); // uploaded_files[0] 정보

  // 데이터
  const [originalData, setOriginalData] = useState([]);
  const [sessionData, setSessionData] = useState([]);
  const [columns, setColumns] = useState([]);

  // 원본 테이블 접힘
  const [isOriginalCollapsed, setIsOriginalCollapsed] = useState(false);

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(1000);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [loading, setLoading] = useState(false);

  // 탭 상태
  const [activeTab, setActiveTab] = useState('remove-columns');

  // ===== 제거 열 설정 (컬럼 매핑) =====
  const [columnMappings, setColumnMappings] = useState([]);

  // ===== 데이터 삭제 =====
  const [deleteBaseColumn, setDeleteBaseColumn] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedDeleteRows, setSelectedDeleteRows] = useState(new Set());
  const [selectAllData, setSelectAllData] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // 표준화 설정
  const [standardKeyColumn, setStandardKeyColumn] = useState('');
  const [standardValueColumn, setStandardValueColumn] = useState('');
  const [standardData, setStandardData] = useState([]);

  // 필수 항목 설정
  const [requiredColumns, setRequiredColumns] = useState({
    category: '',
    costCenter: '',
    supplier: '',
    amount: '',
    target: '',
  });

  // ===== 파생 상태 =====
  // visible 컬럼만 (테이블 렌더링용)
  const visibleColumns = useMemo(() => {
    if (columnMappings.length === 0) return columns;
    const visibleSet = new Set(
      columnMappings.filter(m => m.isVisible).map(m => m.originalName)
    );
    return columns.filter(col => visibleSet.has(col));
  }, [columns, columnMappings]);

  // 필수 항목 설정에서 사용할 수 있는 컬럼 (visible만)
  const availableRequiredColumns = useMemo(() => {
    return visibleColumns.filter(col => col !== '_id' && col !== 'row_number');
  }, [visibleColumns]);

  // ===== useEffect - 세션 정보 + 파일 정보 로드 =====
  useEffect(() => {
    const loadSessionInfo = async () => {
      try {
        const session = await uploadService.getSession(projectId, sessionId);
        setSessionInfo({
          sessionName: session.sessionName || sessionId,
          totalRecords: session.totalRowCount || 0,
          totalAmount: session.totalAmount || 0,
        });

        // uploaded_files에서 첫 번째 파일 정보 추출
        if (session.uploadedFiles && session.uploadedFiles.length > 0) {
          setFileInfo(session.uploadedFiles[0]);
        }
      } catch (error) {
        console.error('세션 정보 로드 실패:', error);
      }
    };
    loadSessionInfo();
  }, [projectId, sessionId]);

  // ===== 컬럼 매핑 로드 =====
  useEffect(() => {
    const loadColumnMappings = async () => {
      try {
        const mappings = await uploadService.getColumnMappings(projectId, sessionId);
        setColumnMappings(mappings);
      } catch (error) {
        console.error('컬럼 매핑 로드 실패:', error);
      }
    };
    loadColumnMappings();
  }, [projectId, sessionId]);

  // ===== 필수 항목 자동 매핑 =====
  useEffect(() => {
    if (!fileInfo || columns.length === 0) return;

    const trimMatch = (cols, target) => {
      if (!target) return '';
      return cols.find(c => c.trim() === target.trim()) || '';
    };

    const containsMatch = (cols, keyword) => {
      return cols.find(c => c.trim().includes(keyword)) || '';
    };

    setRequiredColumns(prev => {
      const newCols = { ...prev };

      // 세목 열: account_contents의 항목과 일치하는 컬럼명
      if (!newCols.category && fileInfo.accountColumnName) {
        newCols.category = trimMatch(columns, fileInfo.accountColumnName);
      }

      // 금액 열: amount_column_name (trim 비교)
      if (!newCols.amount && fileInfo.amountColumnName) {
        newCols.amount = trimMatch(columns, fileInfo.amountColumnName);
      }

      // 코스트센터 열: '코스트센터' 포함 컬럼
      if (!newCols.costCenter) {
        newCols.costCenter = containsMatch(columns, '코스트센터');
      }

      // 공급업체 열: '공급업체' 포함 컬럼
      if (!newCols.supplier) {
        newCols.supplier = containsMatch(columns, '공급업체');
      }

      // 타겟 열: '타겟' 포함 컬럼
      if (!newCols.target) {
        newCols.target = containsMatch(columns, '타겟');
      }

      return newCols;
    });
  }, [fileInfo, columns]);

  // ===== 데이터 로드 =====
  const loadSessionData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await uploadService.getSessionData(
        projectId, sessionId, currentPage, pageSize
      );

      setColumns(result.columns || []);
      setOriginalData(result.data || []);
      setSessionData(result.data || []);
      setTotalRows(result.totalCount || 0);
      setTotalPages(result.totalPages || 0);
    } catch (error) {
      console.error('세션 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId, currentPage, pageSize]);

  useEffect(() => {
    loadSessionData();
  }, [loadSessionData]);

  // ===== 제거 열 설정 핸들러 =====
  const handleColumnVisibilityToggle = async (columnName, currentVisible) => {
    const newVisible = !currentVisible;
    // 즉시 UI 반영
    setColumnMappings(prev =>
      prev.map(m => m.originalName === columnName ? { ...m, isVisible: newVisible } : m)
    );
    try {
      await uploadService.updateColumnVisibility(projectId, sessionId, columnName, newVisible);
    } catch (error) {
      console.error('컬럼 가시성 변경 실패:', error);
      // 실패 시 롤백
      setColumnMappings(prev =>
        prev.map(m => m.originalName === columnName ? { ...m, isVisible: currentVisible } : m)
      );
    }
  };

  // ===== 데이터 삭제 핸들러 =====
  const handleSearch = async () => {
    if (!deleteBaseColumn) {
      alert('기준 열을 선택해주세요.');
      return;
    }
    if (!searchKeyword.trim()) {
      alert('검색 키워드를 입력해주세요.');
      return;
    }

    setSearchLoading(true);
    try {
      const results = await uploadService.searchSessionData(
        projectId, sessionId, deleteBaseColumn, searchKeyword.trim()
      );
      setSearchResults(results);
      setSelectedDeleteRows(new Set());
      setSelectAllData(false);
    } catch (error) {
      console.error('데이터 검색 실패:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleToggleDeleteRow = (rowId) => {
    setSelectedDeleteRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleSelectAllToggle = (checked) => {
    setSelectAllData(!!checked);
    if (checked) {
      setSelectedDeleteRows(new Set(searchResults.map(r => r._id)));
    } else {
      setSelectedDeleteRows(new Set());
    }
  };

  const handleDataDelete = async () => {
    if (selectedDeleteRows.size === 0) {
      alert('삭제할 데이터를 선택해주세요.');
      return;
    }

    try {
      const rowIds = Array.from(selectedDeleteRows);
      await uploadService.hideSessionDataRows(projectId, sessionId, rowIds);
      // 검색 결과에서 제거
      setSearchResults(prev => prev.filter(r => !selectedDeleteRows.has(r._id)));
      setSelectedDeleteRows(new Set());
      setSelectAllData(false);
      // 테이블 데이터 새로고침
      loadSessionData();
    } catch (error) {
      console.error('데이터 삭제 실패:', error);
      alert('데이터 삭제에 실패했습니다.');
    }
  };

  const handleDataRestore = async () => {
    if (selectedDeleteRows.size === 0) {
      alert('원복할 데이터를 선택해주세요.');
      return;
    }

    try {
      const rowIds = Array.from(selectedDeleteRows);
      await uploadService.restoreSessionDataRows(projectId, sessionId, rowIds);
      setSelectedDeleteRows(new Set());
      setSelectAllData(false);
      loadSessionData();
    } catch (error) {
      console.error('데이터 원복 실패:', error);
      alert('데이터 원복에 실패했습니다.');
    }
  };

  // ===== 필수 항목 설정 - 중복 방지 =====
  const getUsedRequiredColumns = (excludeKey) => {
    return Object.entries(requiredColumns)
      .filter(([key]) => key !== excludeKey)
      .map(([, value]) => value)
      .filter(Boolean);
  };

  const handleComplete = () => {
    navigate(`/projects/${projectId}/sessions/${sessionId}/preprocessing`);
  };

  // ===== 렌더링 =====
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">

        {/* 상단 헤더 (고정) */}
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
                  Step 2: Start Analysis
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{sessionInfo.sessionName}</span>
                <div className="text-sm font-normal text-muted-foreground">
                  총 {totalRows.toLocaleString()}건 / 합계: {sessionInfo.totalAmount.toLocaleString()}원
                </div>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 메인 콘텐츠 그리드 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측: 테이블 영역 (8/12) */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 1. 원본 테이블 */}
            <Card className={`flex-shrink-0 transition-all duration-300 shadow-sm`}>
              <CardHeader
                className="py-3 px-4 border-b bg-white cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setIsOriginalCollapsed(!isOriginalCollapsed)}
              >
                <CardTitle className="text-base flex items-center justify-between">
                  <span>원본 데이터 <span className="text-xs font-normal text-gray-500 ml-2">(클릭하여 {isOriginalCollapsed ? '펼치기' : '접기'})</span></span>
                  {isOriginalCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </CardTitle>
              </CardHeader>

              {!isOriginalCollapsed && (
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[250px]">
                    <Table>
                      <TableHeader className="bg-gray-100 sticky top-0 z-10">
                        <TableRow>
                          {visibleColumns.map((col) => (
                            <TableHead key={col} className="font-semibold text-xs whitespace-nowrap bg-gray-100">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow>
                            <TableCell colSpan={visibleColumns.length || 1} className="text-center py-4">
                              <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
                                <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
                                로딩 중...
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          originalData.map((row, idx) => (
                            <TableRow key={row._id || idx} className="hover:bg-muted/50">
                              {visibleColumns.map((col) => (
                                <TableCell key={col} className="text-xs whitespace-nowrap">
                                  {row[col] ?? ''}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* 2. 가공 데이터 테이블 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <CardTitle className="text-base">가공 데이터</CardTitle>
              </CardHeader>

              <CardContent className="flex-1 relative p-0 min-h-0">
                <div className="absolute inset-0 overflow-auto">
                  <Table>
                    <TableHeader className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <TableRow>
                        {visibleColumns.map((col) => (
                          <TableHead key={col} className="font-semibold text-xs whitespace-nowrap bg-gray-100">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={visibleColumns.length || 1} className="text-center py-8">
                            <div className="flex items-center justify-center gap-2 text-muted-foreground">
                              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                              데이터 로딩 중...
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        sessionData.map((row, idx) => (
                          <TableRow key={row._id || idx} className="hover:bg-muted/50">
                            {visibleColumns.map((col) => (
                              <TableCell key={col} className="text-xs whitespace-nowrap">
                                {row[col] ?? ''}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>

              {/* 페이지네이션 */}
              <div className="p-3 border-t bg-white flex-shrink-0">
                <div className="flex items-center justify-between text-xs">
                  <div className="text-muted-foreground hidden sm:block">
                    {(currentPage * pageSize + 1).toLocaleString()} - {Math.min((currentPage + 1) * pageSize, totalRows).toLocaleString()} / 총 {totalRows.toLocaleString()}건
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(value) => {
                        setPageSize(Number(value));
                        setCurrentPage(0);
                      }}
                    >
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="100">100개씩</SelectItem>
                        <SelectItem value="500">500개씩</SelectItem>
                        <SelectItem value="1000">1000개씩</SelectItem>
                        <SelectItem value="5000">5000개씩</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(0)} disabled={currentPage === 0}>
                        처음
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                        disabled={currentPage === 0}
                      >
                        이전
                      </Button>
                      <span className="flex items-center px-2 text-xs font-medium">
                        {currentPage + 1} / {totalPages || 1}
                      </span>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                        disabled={currentPage >= totalPages - 1}
                      >
                        다음
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(totalPages - 1)} disabled={currentPage >= totalPages - 1}>
                        마지막
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* 우측: 설정 패널 (4/12) */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">

            {/* 설정 패널 (스크롤 가능 영역) */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              {/* 제거 열 설정 / 데이터 삭제 탭 */}
              <Card>
                <CardContent className="pt-4 px-4 pb-4">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                      <TabsTrigger value="remove-columns">제거 열 설정</TabsTrigger>
                      <TabsTrigger value="delete-data">데이터 삭제</TabsTrigger>
                    </TabsList>

                    {/* ===== 제거 열 설정 탭 ===== */}
                    <TabsContent value="remove-columns" className="space-y-3 mt-0">
                      <p className="text-xs text-muted-foreground">
                        체크 해제 시 해당 컬럼이 테이블에서 숨겨집니다.
                      </p>
                      <div className="border rounded-md p-2 space-y-1 max-h-[300px] overflow-y-auto bg-white">
                        {columnMappings.map((col) => (
                          <div key={col.id || col.originalName} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                            <Checkbox
                              id={`col-vis-${col.originalName}`}
                              checked={col.isVisible}
                              onCheckedChange={() => handleColumnVisibilityToggle(col.originalName, col.isVisible)}
                            />
                            <label
                              htmlFor={`col-vis-${col.originalName}`}
                              className={`text-sm cursor-pointer flex-1 ${!col.isVisible ? 'text-gray-400 line-through' : ''}`}
                            >
                              {col.originalName}
                            </label>
                          </div>
                        ))}
                        {columnMappings.length === 0 && (
                          <p className="text-xs text-gray-400 p-2">컬럼 정보가 없습니다.</p>
                        )}
                      </div>
                    </TabsContent>

                    {/* ===== 데이터 삭제 탭 ===== */}
                    <TabsContent value="delete-data" className="space-y-3 mt-0">
                      <div>
                        <label className="text-xs font-medium mb-1.5 block">기준 열 선택</label>
                        <Select value={deleteBaseColumn} onValueChange={setDeleteBaseColumn}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="데이터 삭제 기준 열 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {visibleColumns.filter(c => c !== '_id' && c !== 'row_number').map((col) => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2">
                        <Input
                          className="h-9"
                          placeholder="검색 키워드 입력"
                          value={searchKeyword}
                          onChange={(e) => setSearchKeyword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                        <Button size="sm" className="h-9 px-3" onClick={handleSearch} disabled={searchLoading}>
                          <Search className="h-4 w-4 mr-1" />
                          검색
                        </Button>
                      </div>

                      {searchResults.length > 0 && (
                        <>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="select-all-delete"
                              checked={selectAllData}
                              onCheckedChange={handleSelectAllToggle}
                            />
                            <label htmlFor="select-all-delete" className="text-sm cursor-pointer">
                              전체 선택 ({searchResults.length}건)
                            </label>
                          </div>

                          <div className="border rounded-md max-h-[200px] overflow-y-auto bg-white">
                            {searchResults.map((row) => (
                              <div
                                key={row._id}
                                className={`flex items-center gap-2 p-2 border-b last:border-b-0 hover:bg-gray-50 text-xs ${
                                  selectedDeleteRows.has(row._id) ? 'bg-red-50' : ''
                                }`}
                              >
                                <Checkbox
                                  checked={selectedDeleteRows.has(row._id)}
                                  onCheckedChange={() => handleToggleDeleteRow(row._id)}
                                />
                                <span className="truncate flex-1">
                                  {deleteBaseColumn && row[deleteBaseColumn] != null
                                    ? String(row[deleteBaseColumn])
                                    : `Row ${row.row_number || row._id}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {searchResults.length === 0 && searchKeyword && !searchLoading && (
                        <p className="text-xs text-gray-400 text-center py-2">검색 결과가 없습니다.</p>
                      )}

                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 h-9" onClick={handleDataRestore} disabled={selectedDeleteRows.size === 0}>
                          <RotateCcw className="h-4 w-4 mr-1" /> 데이터 원복
                        </Button>
                        <Button variant="destructive" className="flex-1 h-9" onClick={handleDataDelete} disabled={selectedDeleteRows.size === 0}>
                          <Trash2 className="h-4 w-4 mr-1" /> 데이터 삭제
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* 표준화 설정 */}
              <Card>
                <CardHeader className="py-3 px-4 border-b">
                  <CardTitle className="text-sm font-bold">코스트센터/공급업체 명 표준화</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 px-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Key 열</label>
                      <Select value={standardKeyColumn} onValueChange={setStandardKeyColumn}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {visibleColumns.filter(c => c !== '_id' && c !== 'row_number').map((col) => (<SelectItem key={col} value={col}>{col}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">변경 열</label>
                      <Select value={standardValueColumn} onValueChange={setStandardValueColumn}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {visibleColumns.filter(c => c !== '_id' && c !== 'row_number').map((col) => (<SelectItem key={col} value={col}>{col}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="border rounded-md overflow-hidden max-h-[150px] overflow-y-auto bg-white">
                    <Table>
                      <TableHeader className="bg-gray-100 sticky top-0">
                        <TableRow>
                          <TableHead className="text-xs h-8">Key 값</TableHead>
                          <TableHead className="text-xs h-8">대상값</TableHead>
                          <TableHead className="text-xs h-8 w-16 text-center">Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {standardData.length > 0 ? (
                          standardData.map((row, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-xs py-1">{row.keyValue}</TableCell>
                              <TableCell className="text-xs py-1">{row.targetValue}</TableCell>
                              <TableCell className="text-xs py-1 text-center">{row.count}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-xs text-gray-400 text-center py-4">
                              다음 세션에서 구현 예정
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <Button className="w-full h-8 text-xs" disabled>표준화 수행 (다음 세션 구현 예정)</Button>
                </CardContent>
              </Card>

              {/* 필수 항목 설정 */}
              <Card>
                <CardHeader className="py-3 px-4 border-b">
                  <CardTitle className="text-sm font-bold">필수 항목 설정</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 px-4 space-y-2">
                  {[
                    { label: '세목 열', key: 'category' },
                    { label: '코스트센터 열', key: 'costCenter' },
                    { label: '공급업체 열', key: 'supplier' },
                    { label: '금액 열', key: 'amount' },
                    { label: '타겟 열', key: 'target' },
                  ].map((field) => {
                    const usedCols = getUsedRequiredColumns(field.key);
                    // 사용 가능 컬럼: visible 컬럼 중 다른 필수항목에서 이미 선택된 것 제외
                    const selectableCols = availableRequiredColumns.filter(
                      col => !usedCols.includes(col)
                    );
                    // 현재 선택된 값이 hidden 된 컬럼이면 표시 안 함
                    const currentValue = requiredColumns[field.key];
                    const isCurrentValid = currentValue && availableRequiredColumns.includes(currentValue);

                    return (
                      <div key={field.key} className="flex items-center justify-between">
                        <label className="text-xs font-medium w-24">{field.label}</label>
                        <Select
                          value={isCurrentValid ? currentValue : ''}
                          onValueChange={(value) =>
                            setRequiredColumns(prev => ({ ...prev, [field.key]: value }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectableCols.map((col) => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* 완료 버튼 (하단 고정) */}
            <div className="pt-3 mt-auto flex-shrink-0 z-20 bg-gray-50 pb-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold"
                onClick={handleComplete}
              >
                완료 → Step 3: Preprocessing
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
