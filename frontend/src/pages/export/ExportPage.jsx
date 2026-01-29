// frontend/src/pages/export/ExportPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Home,
  Download,
  Trash2,
} from 'lucide-react';

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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Mock Data 생성 함수들
const generateClusteringResults = () => [
  { id: 1, clusterName: '이커머스', subClusterName: '-', keywordList: '실비,안분,이커머...', count: 1408 },
  { id: 2, clusterName: 'HM', subClusterName: '-', keywordList: '구로,구로 남스탁...', count: 402 },
  { id: 3, clusterName: 'Undefined', subClusterName: '-', keywordList: '(주) 코로넷,레이...', count: 4460 },
];

const generateOriginalData = () => {
  const data = [];
  for (let i = 1; i <= 20; i++) {
    data.push({
      id: i,
      clusterName: 'Undefined',
      subClusterName: '-',
      연도: '2019',
      세그먼트: (7200 + Math.floor(Math.random() * 1000)).toString(),
      전기일: (43500 + Math.floor(Math.random() * 200)).toString(),
      문서번호: (136000000 + Math.floor(Math.random() * 1000000)).toString(),
      원가요소: '51213200',
      계정명: '지급수수료',
      원가요소이름: '지급수수료(하역...',
      'Val.in RC': Math.floor(Math.random() * 15000000),
      코스트센터: ['BNR8000', 'BNS8000', 'BNK8000', 'BNL8000'][i % 4],
      지점명: ['불광점', '소림점', '순천점', '송탄점'][i % 4],
      'CO 오브젝트이름': ['아동2CD_공통', '소림점', '순천 해외명품', '송탄_란참'][i % 4],
    });
  }
  return data;
};

const generateExportData = () => {
  const data = [];
  for (let i = 1; i <= 15; i++) {
    data.push({
      id: i,
      clusterName: 'Undefined',
      subClusterName: '-',
      연도: '2019',
      세그먼트: (7200 + Math.floor(Math.random() * 500)).toString(),
      전기일: (43500 + Math.floor(Math.random() * 200)).toString(),
      문서번호: (136000000 + Math.floor(Math.random() * 1000000)).toString(),
      원가요소: '51213200',
      계정명: '지급수수료',
      원가요소이름: '지급수수료(하역...',
      'Val.in RC': Math.floor(Math.random() * 10000000),
      코스트센터: ['BGO7217', 'BGT8501', 'BGO8212', 'BGT8212'][i % 4],
      지점명: ['불광점', '동백 소림 해외명', '순천점', '순천점'][i % 4],
      'CO 오브젝트이름': ['불광 해외명로', '동백 소림 해외명', '순천 해외명품', '순천 해외명품'][i % 4],
    });
  }
  return data;
};

// 제거 열 설정 초기값
const initialColumns = [
  { field: '연도', checked: true },
  { field: '세그먼트', checked: true },
  { field: '전기일', checked: true },
  { field: '문서번호', checked: true },
  { field: '원가요소', checked: true },
  { field: '원가요소이름', checked: true },
  { field: '코스트센터', checked: true },
];

function ExportPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  // ===== 상태 관리 =====
  const [sessionInfo] = useState({
    sessionName: '지급수수료_sample1_2025-10-11',
  });

  const [clusteringResults, setClusteringResults] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [exportData, setExportData] = useState([]);

  // 원본 테이블 페이징
  const [originalPage, setOriginalPage] = useState(1);
  const [originalPageSize, setOriginalPageSize] = useState(1000);
  const [originalTotalRows] = useState(6270);

  // Export 결과 페이징
  const [exportPage, setExportPage] = useState(1);
  const [exportPageSize, setExportPageSize] = useState(1000);
  const [exportTotalRows] = useState(6270);

  // 제거 열 설정
  const [columnList, setColumnList] = useState(initialColumns);
  const [selectAllColumns, setSelectAllColumns] = useState(false);

  // ===== 계산된 값 =====
  const originalTotalPages = Math.ceil(originalTotalRows / originalPageSize);
  const originalStartRow = (originalPage - 1) * originalPageSize + 1;
  const originalEndRow = Math.min(originalPage * originalPageSize, originalTotalRows);

  const exportTotalPages = Math.ceil(exportTotalRows / exportPageSize);
  const exportStartRow = (exportPage - 1) * exportPageSize + 1;
  const exportEndRow = Math.min(exportPage * exportPageSize, exportTotalRows);

  // ===== useEffect =====
  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = () => {
    setClusteringResults(generateClusteringResults());
    setOriginalData(generateOriginalData());
    setExportData(generateExportData());
  };

  // ===== 페이징 핸들러 =====
  const handleOriginalPageChange = (newPage) => {
    setOriginalPage(newPage);
  };

  const handleExportPageChange = (newPage) => {
    setExportPage(newPage);
  };

  // ===== 컬럼 설정 핸들러 =====
  const handleColumnToggle = (field) => {
    setColumnList(
      columnList.map((col) =>
        col.field === field ? { ...col, checked: !col.checked } : col
      )
    );
  };

  const handleSelectAllColumns = (checked) => {
    setSelectAllColumns(checked);
    setColumnList(columnList.map((col) => ({ ...col, checked })));
  };

  const handleRemoveSelectedColumns = () => {
    const selectedColumns = columnList.filter((col) => col.checked);
    if (selectedColumns.length === 0) {
      alert('제거할 열을 선택하세요.');
      return;
    }
    alert(`${selectedColumns.length}개 열이 Export에서 제외됩니다.`);
  };

  // ===== Excel 내보내기 + 세션 완료 =====
  const handleExcelSaveAndComplete = () => {
    if (!window.confirm('Excel 파일을 내보내고 세션을 완료하시겠습니까?')) return;

    alert('Excel 파일을 저장하고 세션을 완료합니다.');
    // 실제로는 API 호출 후 navigate
    navigate(`/projects/${projectId}/sessions`);
  };

  // ===== 숫자 포맷팅 =====
  const formatNumber = (value) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('ko-KR');
  };

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
                  Step 6: Export
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>📂 {sessionInfo.sessionName}</span>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 메인 콘텐츠 그리드 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측 (8/12) - 테이블 영역 */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 원본 테이블 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <CardTitle className="text-sm font-bold">
                  원본 테이블 ({originalTotalRows.toLocaleString()}건)
                </CardTitle>
              </CardHeader>

              <CardContent className="p-0 flex-1 relative min-h-0 flex flex-col">
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <Table>
                    <TableHeader className="bg-gray-100 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="font-semibold bg-gray-100 sticky left-0 z-20">
                          클러스터명
                        </TableHead>
                        <TableHead className="font-semibold bg-gray-100 sticky left-[90px] z-20">
                          세부클러스터명
                        </TableHead>
                        <TableHead className="font-semibold bg-gray-100">연도</TableHead>
                        <TableHead className="font-semibold bg-gray-100">세그먼트</TableHead>
                        <TableHead className="font-semibold bg-gray-100">전기일</TableHead>
                        <TableHead className="font-semibold bg-gray-100">문서번호</TableHead>
                        <TableHead className="font-semibold bg-gray-100">원가요소</TableHead>
                        <TableHead className="font-semibold bg-gray-100">계정명</TableHead>
                        <TableHead className="font-semibold bg-gray-100">원가요소이름</TableHead>
                        <TableHead className="font-semibold bg-gray-100 text-right">
                          Val.in RC
                        </TableHead>
                        <TableHead className="font-semibold bg-gray-100">코스트센터</TableHead>
                        <TableHead className="font-semibold bg-gray-100">지점명</TableHead>
                        <TableHead className="font-semibold bg-gray-100">CO 오브젝트이름</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {originalData.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs sticky left-0 bg-white z-10">
                            {row.clusterName}
                          </TableCell>
                          <TableCell className="text-xs sticky left-[90px] bg-white z-10">
                            {row.subClusterName}
                          </TableCell>
                          <TableCell className="text-xs">{row.연도}</TableCell>
                          <TableCell className="text-xs">{row.세그먼트}</TableCell>
                          <TableCell className="text-xs">{row.전기일}</TableCell>
                          <TableCell className="text-xs">{row.문서번호}</TableCell>
                          <TableCell className="text-xs">{row.원가요소}</TableCell>
                          <TableCell className="text-xs">{row.계정명}</TableCell>
                          <TableCell className="text-xs">{row.원가요소이름}</TableCell>
                          <TableCell className="text-xs text-right">
                            {formatNumber(row['Val.in RC'])}
                          </TableCell>
                          <TableCell className="text-xs">{row.코스트센터}</TableCell>
                          <TableCell className="text-xs">{row.지점명}</TableCell>
                          <TableCell className="text-xs">{row['CO 오브젝트이름']}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* 페이징 Footer */}
                {originalTotalPages > 1 && (
                  <div className="p-3 border-t bg-white flex-shrink-0">
                    <div className="flex items-center justify-between text-xs">
                      <div className="text-muted-foreground hidden sm:block">
                        {originalStartRow} - {originalEndRow} / 총 {originalTotalRows.toLocaleString()}건
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                        <Select
                          value={originalPageSize.toString()}
                          onValueChange={(value) => {
                            setOriginalPageSize(Number(value));
                            setOriginalPage(1);
                          }}
                        >
                          <SelectTrigger className="w-[100px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1000">1000개씩</SelectItem>
                            <SelectItem value="2000">2000개씩</SelectItem>
                            <SelectItem value="5000">5000개씩</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => handleOriginalPageChange(1)}
                            disabled={originalPage === 1}
                          >
                            처음
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => handleOriginalPageChange(Math.max(1, originalPage - 1))}
                            disabled={originalPage === 1}
                          >
                            이전
                          </Button>
                          <span className="flex items-center px-2 text-xs font-medium">
                            {originalPage} / {originalTotalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() =>
                              handleOriginalPageChange(Math.min(originalTotalPages, originalPage + 1))
                            }
                            disabled={originalPage === originalTotalPages}
                          >
                            다음
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => handleOriginalPageChange(originalTotalPages)}
                            disabled={originalPage === originalTotalPages}
                          >
                            마지막
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Export 결과 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <CardTitle className="text-sm font-bold">
                  Export 결과 ({exportTotalRows.toLocaleString()}건)
                </CardTitle>
              </CardHeader>

              <CardContent className="p-0 flex-1 relative min-h-0 flex flex-col">
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <Table>
                    <TableHeader className="bg-gray-100 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="font-semibold bg-gray-100 sticky left-0 z-20">
                          클러스터명
                        </TableHead>
                        <TableHead className="font-semibold bg-gray-100 sticky left-[90px] z-20">
                          세부클러스터명
                        </TableHead>
                        <TableHead className="font-semibold bg-gray-100">연도</TableHead>
                        <TableHead className="font-semibold bg-gray-100">세그먼트</TableHead>
                        <TableHead className="font-semibold bg-gray-100">전기일</TableHead>
                        <TableHead className="font-semibold bg-gray-100">문서번호</TableHead>
                        <TableHead className="font-semibold bg-gray-100">원가요소</TableHead>
                        <TableHead className="font-semibold bg-gray-100">계정명</TableHead>
                        <TableHead className="font-semibold bg-gray-100">원가요소이름</TableHead>
                        <TableHead className="font-semibold bg-gray-100 text-right">
                          Val.in RC
                        </TableHead>
                        <TableHead className="font-semibold bg-gray-100">코스트센터</TableHead>
                        <TableHead className="font-semibold bg-gray-100">지점명</TableHead>
                        <TableHead className="font-semibold bg-gray-100">CO 오브젝트이름</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exportData.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs sticky left-0 bg-white z-10">
                            {row.clusterName}
                          </TableCell>
                          <TableCell className="text-xs sticky left-[90px] bg-white z-10">
                            {row.subClusterName}
                          </TableCell>
                          <TableCell className="text-xs">{row.연도}</TableCell>
                          <TableCell className="text-xs">{row.세그먼트}</TableCell>
                          <TableCell className="text-xs">{row.전기일}</TableCell>
                          <TableCell className="text-xs">{row.문서번호}</TableCell>
                          <TableCell className="text-xs">{row.원가요소}</TableCell>
                          <TableCell className="text-xs">{row.계정명}</TableCell>
                          <TableCell className="text-xs">{row.원가요소이름}</TableCell>
                          <TableCell className="text-xs text-right">
                            {formatNumber(row['Val.in RC'])}
                          </TableCell>
                          <TableCell className="text-xs">{row.코스트센터}</TableCell>
                          <TableCell className="text-xs">{row.지점명}</TableCell>
                          <TableCell className="text-xs">{row['CO 오브젝트이름']}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* 페이징 Footer */}
                {exportTotalPages > 1 && (
                  <div className="p-3 border-t bg-white flex-shrink-0">
                    <div className="flex items-center justify-between text-xs">
                      <div className="text-muted-foreground hidden sm:block">
                        {exportStartRow} - {exportEndRow} / 총 {exportTotalRows.toLocaleString()}건
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                        <Select
                          value={exportPageSize.toString()}
                          onValueChange={(value) => {
                            setExportPageSize(Number(value));
                            setExportPage(1);
                          }}
                        >
                          <SelectTrigger className="w-[100px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1000">1000개씩</SelectItem>
                            <SelectItem value="2000">2000개씩</SelectItem>
                            <SelectItem value="5000">5000개씩</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => handleExportPageChange(1)}
                            disabled={exportPage === 1}
                          >
                            처음
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => handleExportPageChange(Math.max(1, exportPage - 1))}
                            disabled={exportPage === 1}
                          >
                            이전
                          </Button>
                          <span className="flex items-center px-2 text-xs font-medium">
                            {exportPage} / {exportTotalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() =>
                              handleExportPageChange(Math.min(exportTotalPages, exportPage + 1))
                            }
                            disabled={exportPage === exportTotalPages}
                          >
                            다음
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => handleExportPageChange(exportTotalPages)}
                            disabled={exportPage === exportTotalPages}
                          >
                            마지막
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 우측 (4/12) */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">

            {/* 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              {/* Clustering 결과 */}
              <Card>
                <CardHeader className="py-3 border-b">
                  <CardTitle className="text-sm font-bold">
                    Clustering 결과 ({clusteringResults.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-3 space-y-2">
                  <p className="text-[11px] text-pink-600">
                    * 클러스터명은 직접 수정이 가능합니다.
                  </p>
                  <p className="text-[11px] text-pink-600">
                    * 각 항목을 우클릭하여 세부 클러스터링 메뉴로 이동할 수 있습니다.
                  </p>

                  <div className="overflow-auto max-h-[150px] border rounded-md custom-scrollbar">
                    <Table>
                      <TableHeader className="bg-gray-100 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="font-semibold text-xs bg-gray-100">
                            클러스터명
                          </TableHead>
                          <TableHead className="font-semibold text-xs bg-gray-100">
                            세부클러스터명
                          </TableHead>
                          <TableHead className="font-semibold text-xs bg-gray-100">
                            키워드목록
                          </TableHead>
                          <TableHead className="font-semibold text-xs text-right bg-gray-100">
                            Count
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clusteringResults.map((result) => (
                          <TableRow key={result.id} className="hover:bg-muted/50">
                            <TableCell className="text-xs">{result.clusterName}</TableCell>
                            <TableCell className="text-xs">{result.subClusterName}</TableCell>
                            <TableCell className="text-xs">{result.keywordList}</TableCell>
                            <TableCell className="text-xs text-right">
                              {formatNumber(result.count)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* 제거 열 설정 */}
              <Card>
                <CardHeader className="py-3 border-b">
                  <CardTitle className="text-sm font-bold">제거 열 설정</CardTitle>
                </CardHeader>
                <CardContent className="pt-3 space-y-3">
                  <p className="text-[11px] text-pink-600">
                    * 선택한 열 정보만 출력하도록 지원합니다.
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">컬럼명</span>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all-columns"
                        checked={selectAllColumns}
                        onCheckedChange={handleSelectAllColumns}
                      />
                      <label
                        htmlFor="select-all-columns"
                        className="text-[11px] cursor-pointer"
                      >
                        전체 선택
                      </label>
                    </div>
                  </div>

                  <div className="max-h-[200px] overflow-y-auto border rounded-md bg-white custom-scrollbar">
                    {columnList.map((col) => (
                      <div
                        key={col.field}
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-b-0 transition-colors ${
                          col.checked ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleColumnToggle(col.field)}
                      >
                        <Checkbox checked={col.checked} onChange={() => {}} />
                        <span className="text-xs">{col.field}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={handleRemoveSelectedColumns}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    선택 열 삭제
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Excel 내보내기 & 세션 완료 버튼 (하단 고정) */}
            <div className="pt-3 mt-auto flex-shrink-0 z-20 bg-gray-50 pb-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold"
                onClick={handleExcelSaveAndComplete}
              >
                <Download className="h-5 w-5 mr-2" />
                Excel 내보내기 & 세션 완료
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExportPage;