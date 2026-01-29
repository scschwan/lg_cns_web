// frontend/src/pages/transform/DataTransformPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, GitMerge, Search, ChevronDown, ChevronUp, Settings } from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

function DataTransformPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  // ===== 상태 관리 =====
  const [sessionInfo] = useState({
    sessionName: '지급수수료_sample1_2025-10-11',
    totalRecords: 6270,
  });

  // 금액 단위
  const [amountUnit, setAmountUnit] = useState('원'); // 원, 천원, 백만원, 억원
  const amountDivisor = {
    '원': 1,
    '천원': 1000,
    '백만원': 1000000,
    '억원': 100000000,
  };

  // 원본/검색결과 테이블 데이터
  const [originalData, setOriginalData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);

  // 원본 테이블 최소화
  const [isOriginalCollapsed, setIsOriginalCollapsed] = useState(false);

  // 키워드 통계
  const [keywordStats, setKeywordStats] = useState([]);

  // 키워드 병합 - 검색
  const [searchMethod, setSearchMethod] = useState('input'); // 'input' or 'select'
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedKeywordFromStats, setSelectedKeywordFromStats] = useState('');

  // 키워드 병합 - 검색 결과
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSearchResult, setSelectedSearchResult] = useState(null);

  // 키워드 병합 - 대상
  const [toKeyword, setToKeyword] = useState('');

  // 클러스터링 조건
  const [clusteringOptions, setClusteringOptions] = useState({
    supplier: true,
    costCenter: true,
  });

  // ===== Mock 데이터 생성 =====
  const generateOriginalData = () => {
    const companies = [
      '더데이걸', '로엠', '포인포인트', '오휴', '핸트메이드',
      '쓰리엔', '지크', '엘본', '이즈백', '트루',
      'CMC', '모스트', '쓰시에', '오스본', '보보',
      '일로', '리틀', '밀리밤', '펠릭스', '스탭',
      '신디파크', '인디안', '엠아이', '란찌', 'SAP',
      '트렌비', '알토', '데이텀', '신드롬', '비욘드',
    ];

    return companies.map((company, idx) => ({
      id: idx + 1,
      processDataId: `pd_${idx + 1}`,
      'CO 오브젝트이름': `인터넷몰 ${company}`,
      상계계정이름: '지급수수료(물류용역)',
      keywords: ['이커머스', '실비', '안분', '지급수수료'], // 키워드 배열 추가
      'Val.in RC': 100000 + Math.floor(Math.random() * 10000000),
    }));
  };

  const calculateKeywordStats = (data) => {
    // 키워드별 count와 합산 금액 계산
    const keywordMap = {};

    data.forEach((row) => {
      row.keywords.forEach((keyword) => {
        if (!keywordMap[keyword]) {
          keywordMap[keyword] = { count: 0, totalAmount: 0 };
        }
        keywordMap[keyword].count += 1;
        keywordMap[keyword].totalAmount += parseInt(row['Val.in RC']);
      });
    });

    // 배열로 변환 후 count 기준 내림차순 정렬
    const stats = Object.keys(keywordMap).map((keyword) => ({
      keyword,
      count: keywordMap[keyword].count,
      totalAmount: keywordMap[keyword].totalAmount,
    }));

    stats.sort((a, b) => b.count - a.count);

    return stats.map((item, idx) => ({
      id: idx + 1,
      ...item,
    }));
  };

  const generateSearchResults = (keyword, data) => {
    // 키워드가 포함된 데이터 찾기
    const filtered = data.filter((row) =>
      row.keywords.some((kw) => kw.includes(keyword))
    );

    // 키워드별 통계 계산 (검색 결과용)
    const keywordMap = {};
    filtered.forEach((row) => {
      row.keywords.forEach((kw) => {
        if (kw.includes(keyword)) {
          if (!keywordMap[kw]) {
            keywordMap[kw] = { count: 0, totalAmount: 0, rows: [] };
          }
          keywordMap[kw].count += 1;
          keywordMap[kw].totalAmount += parseInt(row['Val.in RC']);
          keywordMap[kw].rows.push(row.id);
        }
      });
    });

    return Object.keys(keywordMap).map((kw, idx) => ({
      id: idx + 1,
      keyword: kw,
      count: keywordMap[kw].count,
      totalAmount: keywordMap[kw].totalAmount,
      rowIds: keywordMap[kw].rows,
    }));
  };

  // ===== useEffect =====
  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    try {
      const data = generateOriginalData();
      setOriginalData(data);
      setKeywordStats(calculateKeywordStats(data));
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    }
  };

  // ===== 핸들러 함수 =====
  const handleSearchKeyword = () => {
    const keyword = searchMethod === 'input' ? searchKeyword : selectedKeywordFromStats;

    if (!keyword.trim()) {
      alert('검색할 키워드를 입력하거나 선택해주세요.');
      return;
    }

    // 검색 실행
    const results = generateSearchResults(keyword, originalData);
    setSearchResults(results);

    // 검색 결과 초기화
    setSelectedSearchResult(null);
    setFilteredData([]);
  };

  const handleSelectSearchResult = (result) => {
    setSelectedSearchResult(result);

    const filtered = originalData.filter((row) =>
      result.rowIds.includes(row.id)
    );

    setFilteredData(filtered);

    // ✅ 페이지 초기화
    setCurrentPage(1);
  };

  const handleMergeKeywords = () => {
    if (!selectedSearchResult) {
      alert('병합할 키워드를 선택해주세요.');
      return;
    }

    if (!toKeyword.trim()) {
      alert('대상 키워드를 입력해주세요.');
      return;
    }

    // 키워드 병합 실행
    const fromKeyword = selectedSearchResult.keyword;

    // 원본 데이터의 키워드 변경
    const updatedData = originalData.map((row) => ({
      ...row,
      keywords: row.keywords.map((kw) =>
        kw === fromKeyword ? toKeyword : kw
      ),
    }));

    setOriginalData(updatedData);

    // 키워드 통계 재계산
    setKeywordStats(calculateKeywordStats(updatedData));

    // 필터링된 데이터도 업데이트
    if (filteredData.length > 0) {
      const updatedFiltered = filteredData.map((row) => ({
        ...row,
        keywords: row.keywords.map((kw) =>
          kw === fromKeyword ? toKeyword : kw
        ),
      }));
      setFilteredData(updatedFiltered);
    }

    alert(`키워드 병합 완료:\n[${fromKeyword}] → [${toKeyword}]`);

    // 초기화
    setSearchResults([]);
    setSelectedSearchResult(null);
    setSearchKeyword('');
    setSelectedKeywordFromStats('');
    setToKeyword('');
  };

  const formatAmount = (amount) => {
    const value = amount / amountDivisor[amountUnit];
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 1,
    });
  };

  const handleComplete = () => {
    navigate(`/projects/${projectId}/sessions/${sessionId}/clustering`);
  };

  // ✅ 페이징 state 추가
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ✅ 계산된 값
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, filteredData.length);

  // ✅ 현재 페이지 데이터
  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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
                  Step 4: Data Transform
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>📂 {sessionInfo.sessionName}</span>
                <div className="text-sm font-normal text-muted-foreground">
                  총 {sessionInfo.totalRecords.toLocaleString()}건
                </div>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 메인 콘텐츠 그리드 (남은 높이 100%) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측: 테이블 영역 (8/12) */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 1. 원본 테이블 (접기/펼치기) */}
            <Card className={`flex-shrink-0 transition-all duration-300 shadow-sm`}>
              <CardHeader
                className="py-3 px-4 border-b bg-white cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setIsOriginalCollapsed(!isOriginalCollapsed)}
              >
                <CardTitle className="text-base flex items-center justify-between">
                  <span>
                    원본 데이터
                    <span className="text-xs font-normal text-gray-500 ml-2">
                      (클릭하여 {isOriginalCollapsed ? '펼치기' : '접기'})
                    </span>
                  </span>
                  {isOriginalCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </CardTitle>
              </CardHeader>

              {!isOriginalCollapsed && (
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[250px] custom-scrollbar">
                    <Table>
                      <TableHeader className="bg-gray-100 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">Process Data ID</TableHead>
                          <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">키워드</TableHead>
                          <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">CO 오브젝트이름</TableHead>
                          <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">상계계정이름</TableHead>
                          <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">Val.in RC</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {originalData.map((row) => (
                          <TableRow key={row.id} className="hover:bg-muted/50">
                            <TableCell className="text-xs whitespace-nowrap font-mono">
                              {row.processDataId}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex flex-wrap gap-1">
                                {row.keywords.map((keyword, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-[10px]">
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {row['CO 오브젝트이름']}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {row.상계계정이름}
                            </TableCell>
                            <TableCell className="text-xs text-right whitespace-nowrap">
                              {parseInt(row['Val.in RC']).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* 2. 검색 결과 테이블 (flex-1) */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <CardTitle className="text-base">
                  검색 결과 데이터
                  {selectedSearchResult && (
                    <span className="text-xs font-normal text-muted-foreground ml-2">
                      (키워드: <Badge variant="outline" className="text-[10px]">{selectedSearchResult.keyword}</Badge>)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>

              <CardContent className="p-0 flex-1 relative min-h-0">
                <div className="absolute inset-0 overflow-auto custom-scrollbar">
                  {filteredData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      우측 키워드 병합에서 키워드를 검색하고 결과를 선택해주세요
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                        <TableRow>
                          <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">Process Data ID</TableHead>
                          <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">키워드</TableHead>
                          <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">CO 오브젝트이름</TableHead>
                          <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">상계계정이름</TableHead>
                          <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">Val.in RC</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredData.map((row) => (
                          <TableRow key={row.id} className="hover:bg-muted/50">
                            <TableCell className="text-xs whitespace-nowrap font-mono">
                              {row.processDataId}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex flex-wrap gap-1">
                                {row.keywords.map((keyword, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-[10px]">
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {row['CO 오브젝트이름']}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {row.상계계정이름}
                            </TableCell>
                            <TableCell className="text-xs text-right whitespace-nowrap">
                              {parseInt(row['Val.in RC']).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>

              {/* ✅ 페이징 Footer 추가 */}
                {filteredData.length > 0 && totalPages > 1 && (
                  <div className="p-3 border-t bg-white flex-shrink-0">
                    <div className="flex items-center justify-between text-xs">
                      <div className="text-muted-foreground hidden sm:block">
                        {startRow} - {endRow} / 총 {filteredData.length}건
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
                            <SelectItem value="20">20개씩</SelectItem>
                            <SelectItem value="50">50개씩</SelectItem>
                            <SelectItem value="100">100개씩</SelectItem>
                            <SelectItem value="500">500개씩</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                          >
                            처음
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                          >
                            이전
                          </Button>
                          <span className="flex items-center px-2 text-xs font-medium">
                            {currentPage} / {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                          >
                            다음
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                          >
                            마지막
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
          </div>

          {/* 우측: 키워드 통계 + 병합 패널 (4/12) */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">

            {/* 설정 패널 (스크롤 가능) */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              {/* 키워드 통계 */}
              <Card>
                <CardHeader className="py-3 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">키워드 통계</CardTitle>
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
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[280px] custom-scrollbar">
                    <Table>
                      <TableHeader className="bg-gray-100 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="font-semibold text-xs w-[40px] text-center bg-gray-100">순위</TableHead>
                          <TableHead className="font-semibold text-xs bg-gray-100">키워드</TableHead>
                          <TableHead className="font-semibold text-xs text-right bg-gray-100">Count</TableHead>
                          <TableHead className="font-semibold text-xs text-right bg-gray-100">합계({amountUnit})</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {keywordStats.map((row) => (
                          <TableRow key={row.id} className="hover:bg-muted/50">
                            <TableCell className="text-xs text-center">{row.id}</TableCell>
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
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* 키워드 병합 */}
              <Card>
                <CardHeader className="py-3 border-b">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <GitMerge className="h-4 w-4" />
                    키워드 병합
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">

                  {/* 검색 방법 선택 탭 */}
                  <div className="flex gap-2 mb-3">
                    <Button
                      size="sm"
                      variant={searchMethod === 'input' ? 'default' : 'outline'}
                      className="flex-1 h-8 text-xs"
                      onClick={() => setSearchMethod('input')}
                    >
                      직접 입력
                    </Button>
                    <Button
                      size="sm"
                      variant={searchMethod === 'select' ? 'default' : 'outline'}
                      className="flex-1 h-8 text-xs"
                      onClick={() => setSearchMethod('select')}
                    >
                      통계에서 선택
                    </Button>
                  </div>

                  {/* 검색 입력 영역 */}
                  {searchMethod === 'input' ? (
                    <div className="flex gap-2">
                      <Input
                        className="h-8 text-sm"
                        placeholder="키워드 입력 (예: 이커머스)"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') handleSearchKeyword();
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-8 whitespace-nowrap"
                        onClick={handleSearchKeyword}
                      >
                        <Search className="h-3 w-3 mr-1" />
                        검색
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Select
                        value={selectedKeywordFromStats}
                        onValueChange={setSelectedKeywordFromStats}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="키워드 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {keywordStats.map((stat) => (
                            <SelectItem key={stat.id} value={stat.keyword}>
                              {stat.keyword} ({stat.count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8 whitespace-nowrap"
                        onClick={handleSearchKeyword}
                      >
                        <Search className="h-3 w-3 mr-1" />
                        검색
                      </Button>
                    </div>
                  )}

                  {/* 검색 결과 영역 */}
                  <div>
                    <label className="text-xs font-semibold mb-2 block">
                      검색 결과 ({searchResults.length}건)
                    </label>

                    <div className="border rounded-md p-2 space-y-1 max-h-[200px] overflow-y-auto bg-white">
                      {searchResults.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-4">
                          키워드를 검색해주세요
                        </div>
                      ) : (
                        <Table>
                          <TableHeader className="bg-gray-50 sticky top-0">
                            <TableRow>
                              <TableHead className="text-xs h-7 py-1">키워드</TableHead>
                              <TableHead className="text-xs h-7 py-1 text-right">Count</TableHead>
                              <TableHead className="text-xs h-7 py-1 text-right">합계({amountUnit})</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {searchResults.map((result) => (
                              <TableRow
                                key={result.id}
                                className={`cursor-pointer hover:bg-blue-50 ${
                                  selectedSearchResult?.id === result.id ? 'bg-blue-100' : ''
                                }`}
                                onClick={() => handleSelectSearchResult(result)}
                              >
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

                  {/* 대상 키워드 (To) */}
                  <div>
                    <label className="text-xs font-semibold mb-2 block">
                      대상 키워드 (병합 후)
                    </label>
                    <Input
                      className="h-8 text-sm"
                      placeholder="통합할 키워드 입력 (예: 이커머스)"
                      value={toKeyword}
                      onChange={(e) => setToKeyword(e.target.value)}
                    />
                  </div>

                  {/* 병합 실행 버튼 */}
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 h-10 font-semibold"
                    onClick={handleMergeKeywords}
                    disabled={!selectedSearchResult}
                  >
                    <GitMerge className="h-4 w-4 mr-2" />
                    키워드 병합 실행
                  </Button>

                  {/* 안내 메시지 */}
                  <div className="text-[11px] text-muted-foreground bg-muted p-2 rounded">
                    💡 검색 결과를 클릭 → 대상 키워드 입력 → 병합 실행
                  </div>
                </CardContent>
              </Card>

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
                        setClusteringOptions((prev) => ({ ...prev, supplier: !!checked }))
                      }
                    />
                    <Label htmlFor="supplier" className="text-sm cursor-pointer">
                      공급업체명
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="costCenter"
                      checked={clusteringOptions.costCenter}
                      onCheckedChange={(checked) =>
                        setClusteringOptions((prev) => ({ ...prev, costCenter: !!checked }))
                      }
                    />
                    <Label htmlFor="costCenter" className="text-sm cursor-pointer">
                      코스트센터명
                    </Label>
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