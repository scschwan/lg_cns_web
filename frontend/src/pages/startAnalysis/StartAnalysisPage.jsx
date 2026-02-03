// frontend/src/pages/fileload/FileLoadPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Search, Plus, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

// API 서비스 (추후 구현)
// import sessionDataAPI from '@/services/sessionDataAPI';

export default function StartAnalysisPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  // ===== 상태 관리 =====
  const [sessionInfo, setSessionInfo] = useState({
    sessionName: '지급수수료_sample1_2025-10-11',
    totalRecords: 6270,
    totalAmount: 5461923000,
  });

  // 데이터
  const [originalData, setOriginalData] = useState([]); // 원본 (불변)
  const [sessionData, setSessionData] = useState([]);   // 변경본
  const [columns, setColumns] = useState([]);

  // 원본 테이블 최소화 (기본값 false -> true로 변경하면 처음에 접힌 상태)
  const [isOriginalCollapsed, setIsOriginalCollapsed] = useState(false);

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(0);  // 0-based
  const [pageSize, setPageSize] = useState(1000);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [loading, setLoading] = useState(false);

  // 탭 상태
  const [activeTab, setActiveTab] = useState('remove-columns');

  // 제거 열 설정
  const [availableColumns, setAvailableColumns] = useState([
    { id: 1, name: '연도', checked: false },
    { id: 2, name: '세그먼트', checked: false },
    { id: 3, name: '전기일', checked: false },
    { id: 4, name: '문서번호', checked: false },
    { id: 5, name: '원가요소', checked: false },
    { id: 6, name: '계정명', checked: false },
    { id: 7, name: '원가요소이름', checked: false },
    { id: 8, name: 'CO 오브젝트이름', checked: false },
    { id: 9, name: '상계계정이름', checked: false },
    { id: 10, name: 'Val.in RC', checked: false },
    { id: 11, name: '이름', checked: false },
    { id: 12, name: '코스트센터', checked: false },
  ]);

  const [baseColumnForDelete, setBaseColumnForDelete] = useState('');

  // 데이터 삭제
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectAllData, setSelectAllData] = useState(false);

  // 표준화 설정
  const [standardKeyColumn, setStandardKeyColumn] = useState('');
  const [standardValueColumn, setStandardValueColumn] = useState('');
  const [standardData, setStandardData] = useState([
    { id: 1, keyValue: '인터넷몰', targetValue: '인터넷몰', count: 156 },
    { id: 2, keyValue: '실비', targetValue: '실비', count: 89 },
    { id: 3, keyValue: '안분', targetValue: '안분', count: 234 },
    { id: 4, keyValue: '지급수수료', targetValue: '지급수수료', count: 450 },
    { id: 5, keyValue: '이커머스', targetValue: '이커머스', count: 320 },
    { id: 6, keyValue: '물류용역', targetValue: '물류용역', count: 180 },
    { id: 7, keyValue: 'SAP', targetValue: 'SAP', count: 95 },
    { id: 8, keyValue: '더데이걸', targetValue: '더데이걸', count: 67 },
  ]);

  // 필수 항목 설정
  const [requiredColumns, setRequiredColumns] = useState({
    category: '계정명',
    costCenter: 'CO 오브젝트이름',
    supplier: '상계계정이름',
    amount: 'Val.in RC',
    target: '이름',
  });



  // ===== useEffect - 초기 데이터 로드 =====


  // ===== 데이터 로드 =====
  const loadSessionData = async () => {
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
      };

   useEffect(() => {
      loadSessionData();
      loadColumns();
    }, [sessionId, currentPage, pageSize]);


  // ===== 핸들러 함수 =====
  const handleDataRestore = () => {
    alert('데이터가 원복되었습니다.');
    setSessionData([...originalData]); // 원본으로 복원
  };

  const handleDataDelete = () => {
    alert('선택된 데이터가 삭제되었습니다.');
  };

  const handleStandardize = () => {
    if (!standardKeyColumn || !standardValueColumn) {
      alert('Key 열과 변경 열을 선택해주세요.');
      return;
    }
    alert(`표준화 수행: ${standardKeyColumn} → ${standardValueColumn}`);
  };

  const handleComplete = () => {
    navigate(`/projects/${projectId}/sessions/${sessionId}/preprocessing`);
  };

  // ===== 페이지네이션 =====
  const totalPages = Math.ceil(totalRows / pageSize);
  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalRows);

  return (
    // [Layout Fix] h-full로 DashboardLayout 영역 꽉 채우기
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
                <span>📂 {sessionInfo.sessionName}</span>
                <div className="text-sm font-normal text-muted-foreground">
                  총 {totalRows.toLocaleString()}건 / 합계: {sessionInfo.totalAmount.toLocaleString()}원
                </div>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 메인 콘텐츠 그리드 (남은 높이 100%) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측: 테이블 영역 (8/12) */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 1. 원본 테이블 (flex-shrink-0: 필요할 때만 공간 차지) */}
            <Card className={`flex-shrink-0 transition-all duration-300 shadow-sm ${isOriginalCollapsed ? '' : ''}`}>
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
                  {/* max-height를 주어 펼쳐졌을 때 너무 많은 공간을 차지하지 않도록 제어 */}
                  <div className="overflow-auto max-h-[250px] custom-scrollbar">
                    <Table>
                      <TableHeader className="bg-gray-100 sticky top-0 z-10">
                        <TableRow>
                          {columns.map((col) => (
                            <TableHead key={col} className="font-semibold text-xs whitespace-nowrap bg-gray-100">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {originalData.map((row) => (
                          <TableRow key={row.id} className="hover:bg-muted/50">
                            {columns.map((col) => (
                              <TableCell key={col} className="text-xs whitespace-nowrap">
                                {row[col]}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* 2. 가공 데이터 테이블 (flex-1: 남은 공간 모두 차지) */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <CardTitle className="text-base">가공 데이터</CardTitle>
              </CardHeader>

              {/* 테이블 영역: relative + absolute inset-0으로 부모 꽉 채우기 */}
              <CardContent className="flex-1 relative p-0 min-h-0">
                <div className="absolute inset-0 overflow-auto custom-scrollbar">
                  <Table>
                    <TableHeader className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <TableRow>
                        {columns.map((col) => (
                          <TableHead key={col} className="font-semibold text-xs whitespace-nowrap bg-gray-100">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessionData.map((row) => (
                        <TableRow key={row.id} className="hover:bg-muted/50">
                          {columns.map((col) => (
                            <TableCell key={col} className="text-xs whitespace-nowrap">
                              {row[col]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>

              {/* 페이지네이션 (Card Footer - 고정) */}
              <div className="p-3 border-t bg-white flex-shrink-0">
                <div className="flex items-center justify-between text-xs">
                  <div className="text-muted-foreground hidden sm:block">
                    {startRow} - {endRow} / 총 {totalRows.toLocaleString()}건
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(value) => {
                        setPageSize(Number(value));
                        setCurrentPage(1);
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
                      <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                        처음
                      </Button>
                      <Button
                          variant="outline" size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                          disabled={currentPage === 0}
                      >
                          이전
                      </Button>
                      <span className="text-sm text-muted-foreground">
                          {currentPage + 1} / {totalPages}
                      </span>
                      <Button
                          variant="outline" size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                          disabled={currentPage >= totalPages - 1}
                      >
                          다음
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
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

                    <TabsContent value="remove-columns" className="space-y-3 mt-0">
                      <div>
                        <label className="text-xs font-medium mb-1.5 block">기준 열 선택</label>
                        <Select value={baseColumnForDelete} onValueChange={setBaseColumnForDelete}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="데이터 삭제 기준 열 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {columns.map((col) => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="border rounded-md p-2 space-y-1 max-h-[200px] overflow-y-auto bg-white">
                        {availableColumns.map((col) => (
                          <div key={col.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                            <Checkbox
                              id={`col-${col.id}`}
                              checked={col.checked}
                              onCheckedChange={(checked) => {
                                setAvailableColumns(prev => prev.map(c => c.id === col.id ? { ...c, checked: !!checked } : c));
                              }}
                            />
                            <label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer flex-1">{col.name}</label>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="delete-data" className="space-y-3 mt-0">
                      <div className="flex gap-2">
                        <Input
                          className="h-9"
                          placeholder="검색 키워드 입력"
                          value={searchKeyword}
                          onChange={(e) => setSearchKeyword(e.target.value)}
                        />
                        <Button size="icon" variant="outline" className="h-9 w-9">
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="select-all" checked={selectAllData} onCheckedChange={(checked) => setSelectAllData(!!checked)} />
                        <label htmlFor="select-all" className="text-sm cursor-pointer">전체 선택</label>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 h-9" onClick={handleDataRestore}>
                          <RotateCcw className="h-4 w-4 mr-1" /> 원복
                        </Button>
                        <Button variant="destructive" className="flex-1 h-9" onClick={handleDataDelete}>
                          <Trash2 className="h-4 w-4 mr-1" /> 삭제
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
                          {columns.map((col) => (<SelectItem key={col} value={col}>{col}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">변경 열</label>
                      <Select value={standardValueColumn} onValueChange={setStandardValueColumn}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {columns.map((col) => (<SelectItem key={col} value={col}>{col}</SelectItem>))}
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
                        {standardData.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="text-xs py-1">{row.keyValue}</TableCell>
                            <TableCell className="text-xs py-1">{row.targetValue}</TableCell>
                            <TableCell className="text-xs py-1 text-center">{row.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button className="w-full h-8 text-xs" onClick={handleStandardize}>표준화 수행</Button>
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
                  ].map((field) => (
                    <div key={field.key} className="flex items-center justify-between">
                      <label className="text-xs font-medium w-24">{field.label}</label>
                      <Select
                        value={requiredColumns[field.key]}
                        onValueChange={(value) => setRequiredColumns(prev => ({ ...prev, [field.key]: value }))}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {columns.map((col) => (<SelectItem key={col} value={col}>{col}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
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

export default FileLoadPage;