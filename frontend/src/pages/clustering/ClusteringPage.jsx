// frontend/src/pages/clustering/ClusteringPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Home,
  Search,
  GitMerge,
  Eye,
  Edit2,
  RotateCcw,
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
import { Input } from '@/components/ui/input';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function ClusteringPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  // ===== 상태 관리 =====
  const [sessionInfo] = useState({
    sessionName: '지급수수료_sample1_2025-10-11',
    totalRecords: 6270,
  });

  // 통계
  const [statistics, setStatistics] = useState({
    totalRows: 6270,
    unmergedClusters: 450,
    unmergedTotalAmount: 500000000,
  });

  // 검색
  const [searchMethod, setSearchMethod] = useState('keyword');
  const [searchInput, setSearchInput] = useState('');
  const [exactMatch, setExactMatch] = useState(false);
  const [excludeKeywords, setExcludeKeywords] = useState('');
  const [searchInResults, setSearchInResults] = useState(false);

  // 검색 결과 테이블 + 페이징
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResults, setSelectedResults] = useState([]);
  const [selectAllResults, setSelectAllResults] = useState(false);
  const [amountUnit, setAmountUnit] = useState('원');

  // ===== ✅ 페이징 state 추가 (이 부분이 누락되었습니다!) =====
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 계산된 값
  const totalPages = Math.ceil(searchResults.length / pageSize);
  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, searchResults.length);



  // 키워드/공급업체 통계 (탭)
  const [statsTab, setStatsTab] = useState('keyword');
  const [keywordStats, setKeywordStats] = useState([]);
  const [selectedKeywordStats, setSelectedKeywordStats] = useState([]);
  const [supplierStats, setSupplierStats] = useState([]);
  const [selectedSupplierStats, setSelectedSupplierStats] = useState([]);

  // lv1 선택
  const [lv1Items, setLv1Items] = useState([]);
  const [selectedLv1, setSelectedLv1] = useState(null);

  // 추천 키워드
  const [recommendedKeywords, setRecommendedKeywords] = useState([]);
  const [selectedRecommended, setSelectedRecommended] = useState(null);

  // 병합 결과 (테이블)
  const [mergedClusters, setMergedClusters] = useState([]);
  const [selectedMergedClusters, setSelectedMergedClusters] = useState([]);
  const [detailDialog, setDetailDialog] = useState({ open: false, cluster: null });
  const [selectedDetailItems, setSelectedDetailItems] = useState([]);

  // 클러스터명 수정 다이얼로그
  const [renameDialog, setRenameDialog] = useState({ open: false, cluster: null });
  const [newClusterName, setNewClusterName] = useState('');



  // ===== Mock 데이터 생성 =====
  const generateKeywordStats = () => {
    const keywords = ['이커머스', '실비', '안분', '지급수수료', '물류용역', '인터넷몰', 'SAP'];
    return keywords.map((kw, idx) => ({
      id: idx + 1,
      keyword: kw,
      count: Math.floor(Math.random() * 500) + 100,
      totalAmount: Math.floor(Math.random() * 100000000) + 10000000,
      isMerged: false,
    }));
  };

  const generateSupplierStats = () => {
    const suppliers = ['지급수수료(물류용역)', '광고선전비', '전산비', '임차료', '운반비'];
    return suppliers.map((sup, idx) => ({
      id: idx + 1,
      supplier: sup,
      count: Math.floor(Math.random() * 300) + 50,
      totalAmount: Math.floor(Math.random() * 80000000) + 5000000,
      isMerged: false,
    }));
  };

  const generateSearchResults = (count = 100) => {
    const companies = ['더데이걸', '로엠', '포인포인트', '오휴', '핸트메이드'];
    return Array.from({ length: count }, (_, idx) => ({
      id: idx + 1,
      clusterNumber: idx + 1,
      keywords: ['이커머스', '실비', '안분'],
      department: `인터넷몰 ${companies[idx % companies.length]}`,
      supplier: '지급수수료(물류용역)',
      amount: Math.floor(Math.random() * 10000000) + 100000,
      costCenter: 'CC1000',
    }));
  };

  const generateLv1Items = () => {
    return ['이커머스', '지급수수료', '인터넷몰', '실비', '안분'].map((item, idx) => ({
      id: idx + 1,
      name: item,
    }));
  };

  const generateRecommendedKeywords = () => {
    return ['물류용역', 'SAP', '더데이걸', '로엠'].map((item, idx) => ({
      id: idx + 1,
      keyword: item,
    }));
  };

  const generateMergedClusters = () => {
    return [
      {
        id: 1,
        clusterNumber: 500,
        clusterName: '병합_이커머스_실비_안분',
        keywords: ['이커머스', '실비', '안분'],
        count: 1500,
        totalAmount: 50000000,
        subClusters: [
          { id: 1, clusterNumber: 1, clusterName: '이커머스_실비', count: 500, totalAmount: 15000000 },
          { id: 2, clusterNumber: 2, clusterName: '실비_안분', count: 600, totalAmount: 20000000 },
          { id: 3, clusterNumber: 3, clusterName: '이커머스_안분', count: 400, totalAmount: 15000000 },
        ],
      },
      {
        id: 2,
        clusterNumber: 501,
        clusterName: '병합_지급수수료_물류용역',
        keywords: ['지급수수료', '물류용역'],
        count: 800,
        totalAmount: 30000000,
        subClusters: [
          { id: 4, clusterNumber: 4, clusterName: '지급수수료', count: 400, totalAmount: 15000000 },
          { id: 5, clusterNumber: 5, clusterName: '물류용역', count: 400, totalAmount: 15000000 },
        ],
      },
    ];
  };

  // ===== useEffect =====
  useEffect(() => {
    loadData();
  }, [sessionId]);

  useEffect(() => {
    // 페이지 변경 시 검색 결과 업데이트 (실제 API 호출 위치)
    // 여기서 currentPage, pageSize를 API에 전달
  }, [currentPage]);

// 수정 후
    const loadData = async () => {
      try {
        setKeywordStats(generateKeywordStats());
        setSupplierStats(generateSupplierStats());

        const allResults = generateSearchResults(100);
        setSearchResults(allResults);

        // ❌ 삭제: totalPages는 state가 아니라 계산된 변수이므로 set 함수가 없습니다.
        // setTotalPages(Math.ceil(allResults.length / pageSize));

        setLv1Items(generateLv1Items());
        setRecommendedKeywords(generateRecommendedKeywords());
        setMergedClusters(generateMergedClusters());
      } catch (error) {
        console.error('데이터 로드 실패:', error);
      }
    };

  // ===== 페이징 처리 =====
    const getPaginatedResults = () => {
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      return searchResults.slice(startIndex, endIndex);
    };

  // 수정 후
  const handlePageChange = (page) => {
    setCurrentPage(page); // ✅ 매개변수 page 사용
    setSelectedResults([]); // ✅ 올바른 state 함수 사용
  };

  // ===== 원 단위 변환 =====
  const formatAmount = (amount) => {
    const units = { 원: 1, 천원: 1000, 백만원: 1000000, 억원: 100000000 };
    const divisor = units[amountUnit] || 1;
    return (amount / divisor).toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  };

  // ===== 검색 핸들러 =====
  const handleSearch = () => {
    if (!searchInput.trim()) {
      alert('검색어를 입력하세요.');

      // ✅ 검색 후 페이지 1로 초기화
      setCurrentPage(1);
      return;
    }

    let message = `${searchMethod === 'keyword' ? '키워드' : '공급업체'} 검색: ${searchInput}`;
    if (exactMatch) message += ' (완전 일치)';
    if (excludeKeywords) message += ` / 제외: ${excludeKeywords}`;
    if (searchInResults) message += ' (결과 내 재검색)';

    alert(message);
    setCurrentPage(1); // 검색 시 첫 페이지로
  };

  // ===== 검색 결과 선택 =====
  const handleSelectAllResults = (checked) => {
    setSelectAllResults(checked);
    if (checked) {
      // 전체 선택 (모든 페이지의 모든 데이터)
      setSelectedResults(searchResults.map((r) => r.id));
    } else {
      setSelectedResults([]);
    }
  };

  const handleToggleResult = (id, checked) => {
    if (checked) {
      setSelectedResults([...selectedResults, id]);
    } else {
      setSelectedResults(selectedResults.filter((rid) => rid !== id));
      setSelectAllResults(false);
    }
  };

  // ===== 병합/추가병합 =====
  const handleMerge = () => {
    if (selectedResults.length === 0) {
      alert('병합할 항목을 선택하세요.');
      return;
    }
    const newName = prompt('병합 클러스터 이름을 입력하세요:');
    if (!newName) return;
    alert(`${selectedResults.length}개 항목을 [${newName}]로 병합합니다.`);
    setSelectedResults([]);
    loadData();
  };

  const handleAddMerge = () => {
    if (selectedResults.length === 0) {
      alert('추가 병합할 항목을 선택하세요.');
      return;
    }
    alert('선택한 항목을 기존 병합 클러스터에 추가합니다.');
    setSelectedResults([]);
    loadData();
  };

  // ===== 키워드/공급업체 통계 선택 =====
  const handleToggleKeywordStat = (id, checked) => {
    if (checked) {
      setSelectedKeywordStats([...selectedKeywordStats, id]);
    } else {
      setSelectedKeywordStats(selectedKeywordStats.filter((sid) => sid !== id));
    }
  };

  const handleToggleSupplierStat = (id, checked) => {
    if (checked) {
      setSelectedSupplierStats([...selectedSupplierStats, id]);
    } else {
      setSelectedSupplierStats(selectedSupplierStats.filter((sid) => sid !== id));
    }
  };

  const handleClickKeywordStat = (stat) => {
    setSearchInput(stat.keyword);
    setSearchMethod('keyword');
    handleSearch();
  };

  const handleClickSupplierStat = (stat) => {
    setSearchInput(stat.supplier);
    setSearchMethod('supplier');
    handleSearch();
  };

  // ===== 병합 클러스터링 =====
  const handleMergeClustering = () => {
    const totalSelected = selectedKeywordStats.length + selectedSupplierStats.length;
    if (totalSelected === 0) {
      alert('병합할 항목을 선택하세요.');
      return;
    }
    const newName = prompt('병합 클러스터 이름을 입력하세요:');
    if (!newName) return;
    alert(`${totalSelected}개 항목을 [${newName}]로 병합 클러스터링합니다.`);
    setSelectedKeywordStats([]);
    setSelectedSupplierStats([]);
    loadData();
  };

  // ===== 미병합 클러스터 자동 병합 =====
  const handleAutoMergeUnmerged = () => {
    if (!window.confirm('모든 미병합 클러스터를 하나로 병합하시겠습니까?')) return;

    const newName = prompt('자동 병합 클러스터 이름을 입력하세요:', '미병합_자동병합');
    if (!newName) return;

    alert(`모든 미병합 클러스터를 [${newName}]로 병합합니다.`);
    loadData();
  };

  // ===== lv1/추천 키워드 선택 =====
  const handleSelectLv1 = (item) => {
    setSelectedLv1(item);
    setSearchInput(item.name);
    setSearchMethod('keyword');
  };

  const handleSelectRecommended = (item) => {
    setSelectedRecommended(item);
    setSearchInput(item.keyword);
    setSearchMethod('keyword');
  };

  // ===== 병합 결과 관리 =====
  const handleToggleMergedCluster = (id, checked) => {
    if (checked) {
      setSelectedMergedClusters([...selectedMergedClusters, id]);
    } else {
      setSelectedMergedClusters(selectedMergedClusters.filter((cid) => cid !== id));
    }
  };

  const handleMergeMergedClusters = () => {
    if (selectedMergedClusters.length < 2) {
      alert('병합할 클러스터를 2개 이상 선택하세요.');
      return;
    }
    const newName = prompt('병합된 클러스터 이름을 입력하세요:');
    if (!newName) return;
    alert(`${selectedMergedClusters.length}개 병합 클러스터를 [${newName}]로 재병합합니다.`);
    setSelectedMergedClusters([]);
    loadData();
  };

  const handleUnmergeClusters = () => {
    if (selectedMergedClusters.length === 0) {
      alert('병합 해제할 클러스터를 선택하세요.');
      return;
    }
    if (!window.confirm(`선택한 ${selectedMergedClusters.length}개 클러스터를 병합 해제하시겠습니까?`)) return;

    alert('병합 해제 완료');
    setSelectedMergedClusters([]);
    loadData();
  };

  const handleOpenRenameMergedDialog = (cluster) => {
    setRenameDialog({ open: true, cluster });
    setNewClusterName(cluster.clusterName);
  };

  const handleRenameMergedCluster = () => {
    if (!newClusterName.trim()) {
      alert('클러스터 이름을 입력하세요.');
      return;
    }
    alert(`클러스터 이름을 [${newClusterName}]로 변경합니다.`);
    setRenameDialog({ open: false, cluster: null });
    loadData();
  };

  // ===== 병합 결과 상세 보기 =====
  const handleOpenDetail = (cluster) => {
    setDetailDialog({ open: true, cluster });
    setSelectedDetailItems([]);
  };

  const handleToggleDetailItem = (id, checked) => {
    if (checked) {
      setSelectedDetailItems([...selectedDetailItems, id]);
    } else {
      setSelectedDetailItems(selectedDetailItems.filter((did) => did !== id));
    }
  };

  const handleUnmergeDetailItems = () => {
    if (selectedDetailItems.length === 0) {
      alert('미병합으로 되돌릴 항목을 선택하세요.');
      return;
    }
    if (!window.confirm(`선택한 ${selectedDetailItems.length}개 항목을 미병합으로 되돌리시겠습니까?`)) return;

    alert('미병합으로 되돌리기 완료');
    setSelectedDetailItems([]);
    setDetailDialog({ open: false, cluster: null });
    loadData();
  };

  // ===== 완료 =====
  const handleComplete = () => {
    navigate(`/projects/${projectId}/sessions/${sessionId}/export`);
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
                  Step 5: Clustering
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

        {/* 메인 콘텐츠 그리드 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측 (8/12) */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 통계 1줄 */}
            <Card className="flex-shrink-0 shadow-sm">
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">전체 클러스터 행수:</span>
                    <Badge variant="secondary">{statistics.totalRows.toLocaleString()}건</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">미병합 클러스터 개수:</span>
                    <Badge variant="secondary">{statistics.unmergedClusters.toLocaleString()}개</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">미병합 합산 금액:</span>
                    <Badge variant="secondary">
                      {(statistics.unmergedTotalAmount / 100000000).toFixed(1)}억원
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 검색 섹션 */}
            <Card className="flex-shrink-0 shadow-sm">
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-sm font-bold">검색</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Select value={searchMethod} onValueChange={setSearchMethod}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keyword">키워드</SelectItem>
                      <SelectItem value="supplier">공급업체</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="검색어 입력"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleSearch}>
                    <Search className="h-4 w-4 mr-1" />
                    검색
                  </Button>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="exact-match"
                      checked={exactMatch}
                      onCheckedChange={setExactMatch}
                    />
                    <label htmlFor="exact-match" className="cursor-pointer">
                      키워드 완전 일치
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="search-in-results"
                      checked={searchInResults}
                      onCheckedChange={setSearchInResults}
                    />
                    <label htmlFor="search-in-results" className="cursor-pointer">
                      결과 내 재검색
                    </label>
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <label className="whitespace-nowrap">제외 키워드:</label>
                    <Input
                      placeholder="쉼표(,)로 구분"
                      value={excludeKeywords}
                      onChange={(e) => setExcludeKeywords(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 검색 결과 테이블 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold">
                    검색 결과 ({searchResults.length.toLocaleString()}건)
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={amountUnit} onValueChange={setAmountUnit}>
                      <SelectTrigger className="w-[100px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="원">원</SelectItem>
                        <SelectItem value="천원">천원</SelectItem>
                        <SelectItem value="백만원">백만원</SelectItem>
                        <SelectItem value="억원">억원</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={handleMerge}
                      disabled={selectedResults.length === 0}
                    >
                      병합
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddMerge}
                      disabled={selectedResults.length === 0}
                    >
                      추가병합
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0 flex-1 relative min-h-0 flex flex-col">
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <Table>
                    <TableHeader className="bg-gray-100 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="w-[50px] bg-gray-100">
                          <Checkbox
                            checked={selectAllResults}
                            onCheckedChange={handleSelectAllResults}
                          />
                        </TableHead>
                        <TableHead className="font-semibold bg-gray-100">클러스터번호</TableHead>
                        <TableHead className="font-semibold bg-gray-100">키워드</TableHead>
                        <TableHead className="font-semibold bg-gray-100">CO 오브젝트이름</TableHead>
                        <TableHead className="font-semibold bg-gray-100">상계계정이름</TableHead>
                        <TableHead className="font-semibold text-right bg-gray-100">
                          금액({amountUnit})
                        </TableHead>
                        <TableHead className="font-semibold bg-gray-100">코스트센터</TableHead>
                      </TableRow>
                    </TableHeader>
                   <TableBody>
                     {getPaginatedResults().map((row) => (
                       <TableRow key={row.id}>
                         <TableCell>
                           <Checkbox
                             checked={selectedResults.includes(row.id)} // ✅ 수정됨
                             onCheckedChange={(checked) => {
                               if (checked) {
                                 setSelectedResults([...selectedResults, row.id]); // ✅ 수정됨
                               } else {
                                 setSelectedResults(selectedResults.filter((id) => id !== row.id)); // ✅ 수정됨
                               }
                             }}
                           />
                         </TableCell>
                          <TableCell className="text-xs">#{row.clusterNumber}</TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-wrap gap-1">
                              {row.keywords.map((kw, idx) => (
                                <Badge key={idx} variant="secondary" className="text-[10px]">
                                  {kw}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{row.department}</TableCell>
                          <TableCell className="text-xs">{row.supplier}</TableCell>
                          <TableCell className="text-xs text-right">
                            {formatAmount(row.amount)}
                          </TableCell>
                          <TableCell className="text-xs">{row.costCenter}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>

              {/* 페이징 Footer */}
              {totalPages > 1 && (
                <div className="p-3 border-t bg-white flex-shrink-0">
                  <div className="flex items-center justify-between text-xs">
                    <div className="text-muted-foreground hidden sm:block">
                      {/* ✅ totalSearchResults → searchResults.length */}
                      {startRow} - {endRow} / 총 {searchResults.length}건
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
                            onClick={() => handlePageChange(1)}
                            disabled={currentPage === 1}
                          >
                            처음
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                          >
                            이전
                          </Button>
                          <span  className="flex items-center px-2 text-xs font-medium">{currentPage} / {totalPages}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                          >
                            다음
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => handlePageChange(totalPages)}
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

          {/* 우측 (4/12) */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">

            {/* 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              {/* 키워드/공급업체 통계 (탭) */}
              <Card>
                <Tabs value={statsTab} onValueChange={setStatsTab}>
                  <CardHeader className="py-3 border-b">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="keyword" className="text-xs">
                        키워드 통계
                      </TabsTrigger>
                      <TabsTrigger value="supplier" className="text-xs">
                        공급업체 통계
                      </TabsTrigger>
                    </TabsList>
                  </CardHeader>

                  <TabsContent value="keyword" className="m-0 p-0">
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[220px] custom-scrollbar">
                        <Table>
                          <TableHeader className="bg-gray-100 sticky top-0 z-10">
                            <TableRow>
                              <TableHead className="w-[50px] bg-gray-100">
                                <Checkbox disabled />
                              </TableHead>
                              <TableHead className="font-semibold text-xs bg-gray-100">순위</TableHead>
                              <TableHead className="font-semibold text-xs bg-gray-100">키워드</TableHead>
                              <TableHead className="font-semibold text-xs text-right bg-gray-100">Count</TableHead>
                              <TableHead className="font-semibold text-xs text-right bg-gray-100">
                                합계({amountUnit})
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {keywordStats.filter((s) => !s.isMerged).map((stat, idx) => (
                              <TableRow
                                key={stat.id}
                                className="hover:bg-muted/50 cursor-pointer"
                                onClick={() => handleClickKeywordStat(stat)}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedKeywordStats.includes(stat.id)}
                                    onCheckedChange={(checked) => handleToggleKeywordStat(stat.id, checked)}
                                  />
                                </TableCell>
                                <TableCell className="text-xs">{idx + 1}</TableCell>
                                <TableCell className="text-xs">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {stat.keyword}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {stat.count.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {formatAmount(stat.totalAmount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </TabsContent>

                  <TabsContent value="supplier" className="m-0 p-0">
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[220px] custom-scrollbar">
                        <Table>
                          <TableHeader className="bg-gray-100 sticky top-0 z-10">
                            <TableRow>
                              <TableHead className="w-[50px] bg-gray-100">
                                <Checkbox disabled />
                              </TableHead>
                              <TableHead className="font-semibold text-xs bg-gray-100">순위</TableHead>
                              <TableHead className="font-semibold text-xs bg-gray-100">공급업체</TableHead>
                              <TableHead className="font-semibold text-xs text-right bg-gray-100">Count</TableHead>
                              <TableHead className="font-semibold text-xs text-right bg-gray-100">
                                합계({amountUnit})
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {supplierStats.filter((s) => !s.isMerged).map((stat, idx) => (
                              <TableRow
                                key={stat.id}
                                className="hover:bg-muted/50 cursor-pointer"
                                onClick={() => handleClickSupplierStat(stat)}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedSupplierStats.includes(stat.id)}
                                    onCheckedChange={(checked) => handleToggleSupplierStat(stat.id, checked)}
                                  />
                                </TableCell>
                                <TableCell className="text-xs">{idx + 1}</TableCell>
                                <TableCell className="text-xs">{stat.supplier}</TableCell>
                                <TableCell className="text-xs text-right">
                                  {stat.count.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {formatAmount(stat.totalAmount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </TabsContent>
                </Tabs>
              </Card>

              {/* 병합 클러스터링 버튼 */}
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700"
                onClick={handleMergeClustering}
                disabled={selectedKeywordStats.length + selectedSupplierStats.length === 0}
              >
                <GitMerge className="h-4 w-4 mr-2" />
                병합 클러스터링 ({selectedKeywordStats.length + selectedSupplierStats.length})
              </Button>

              {/* 미병합 클러스터 자동 병합 */}
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700"
                onClick={handleAutoMergeUnmerged}
              >
                <GitMerge className="h-4 w-4 mr-2" />
                미병합 클러스터 자동 병합
              </Button>

              {/* lv1 선택 */}
              <Card>
                <CardHeader className="py-3 border-b">
                  <CardTitle className="text-sm font-bold">lv1 선택</CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  <div className="flex flex-wrap gap-2">
                    {lv1Items.map((item) => (
                      <Badge
                        key={item.id}
                        variant={selectedLv1?.id === item.id ? 'default' : 'outline'}
                        className="cursor-pointer text-xs"
                        onClick={() => handleSelectLv1(item)}
                      >
                        {item.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 추천 키워드 */}
              <Card>
                <CardHeader className="py-3 border-b">
                  <CardTitle className="text-sm font-bold">추천 키워드</CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  <div className="flex flex-wrap gap-2">
                    {recommendedKeywords.map((item) => (
                      <Badge
                        key={item.id}
                        variant={selectedRecommended?.id === item.id ? 'default' : 'outline'}
                        className="cursor-pointer text-xs"
                        onClick={() => handleSelectRecommended(item)}
                      >
                        {item.keyword}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 병합 결과 확인 (테이블) */}
              <Card>
                <CardHeader className="py-3 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">
                      Clustering 병합 결과 확인 ({mergedClusters.length})
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleMergeMergedClusters}
                        disabled={selectedMergedClusters.length < 2}
                      >
                        병합
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleUnmergeClusters}
                        disabled={selectedMergedClusters.length === 0}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        해제
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[300px] custom-scrollbar">
                    <Table>
                      <TableHeader className="bg-gray-100 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="w-[50px] bg-gray-100">
                            <Checkbox disabled />
                          </TableHead>
                          <TableHead className="font-semibold text-xs bg-gray-100">클러스터명</TableHead>
                          <TableHead className="font-semibold text-xs text-right bg-gray-100">Count</TableHead>
                          <TableHead className="font-semibold text-xs text-right bg-gray-100">
                            금액({amountUnit})
                          </TableHead>
                          <TableHead className="font-semibold text-xs bg-gray-100 text-center">
                            관리
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mergedClusters.map((cluster) => (
                          <TableRow key={cluster.id} className="hover:bg-muted/50">
                            <TableCell>
                              <Checkbox
                                checked={selectedMergedClusters.includes(cluster.id)}
                                onCheckedChange={(checked) => handleToggleMergedCluster(cluster.id, checked)}
                              />
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-[9px]">
                                  #{cluster.clusterNumber}
                                </Badge>
                                <span>{cluster.clusterName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {cluster.count.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {formatAmount(cluster.totalAmount)}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={() => handleOpenDetail(cluster)}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={() => handleOpenRenameMergedDialog(cluster)}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
                완료 → Step 6: Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 클러스터명 수정 다이얼로그 */}
      <Dialog
        open={renameDialog.open}
        onOpenChange={(open) => setRenameDialog({ ...renameDialog, open })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>클러스터 이름 변경</DialogTitle>
            <DialogDescription>
              새로운 클러스터 이름을 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="클러스터 이름"
              value={newClusterName}
              onChange={(e) => setNewClusterName(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRenameDialog({ open: false, cluster: null })}
            >
              취소
            </Button>
            <Button onClick={handleRenameMergedCluster}>변경</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 상세 보기 다이얼로그 */}
      <Dialog
        open={detailDialog.open}
        onOpenChange={(open) => setDetailDialog({ ...detailDialog, open })}
      >
        <DialogContent className="max-w-[90vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              병합 클러스터 상세: {detailDialog.cluster?.clusterName}
            </DialogTitle>
            <DialogDescription className="flex items-center justify-between">
              <span>병합된 클러스터 내부의 미병합 클러스터 목록입니다.</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleUnmergeDetailItems}
                disabled={selectedDetailItems.length === 0}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                미병합으로 되돌리기 ({selectedDetailItems.length})
              </Button>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="bg-gray-100 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-[50px] bg-gray-100">
                    <Checkbox disabled />
                  </TableHead>
                  <TableHead className="font-semibold bg-gray-100">클러스터번호</TableHead>
                  <TableHead className="font-semibold bg-gray-100">클러스터명</TableHead>
                  <TableHead className="font-semibold text-right bg-gray-100">Count</TableHead>
                  <TableHead className="font-semibold text-right bg-gray-100">
                    금액({amountUnit})
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailDialog.cluster?.subClusters?.map((sub) => (
                  <TableRow key={sub.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Checkbox
                        checked={selectedDetailItems.includes(sub.id)}
                        onCheckedChange={(checked) => handleToggleDetailItem(sub.id, checked)}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        #{sub.clusterNumber}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{sub.clusterName}</TableCell>
                    <TableCell className="text-xs text-right">
                      {sub.count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {formatAmount(sub.totalAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClusteringPage;