// frontend/src/pages/clustering/ClusteringPage.jsx
//
// Step 5: Clustering 페이지
// - 미병합 클러스터 결과 테이블 (AdvancedTable, 페이징, 체크박스 선택)
// - 병합 기능 (선택한 미병합 클러스터 병합)
// - 병합 결과 확인 테이블 + 병합 해제(전체)
// - 통계 표시
// - 검색은 다음 세션에서 구현

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Home,
  GitMerge,
  Eye,
  Edit2,
  RotateCcw,
  Loader2,
} from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import AdvancedTable from '@/components/AdvancedTable';
import clusteringService from '@/services/clusteringService';

function ClusteringPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  // ===== 상태 =====
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // 통계
  const [statistics, setStatistics] = useState({
    totalRows: 0,
    unmergedCount: 0,
    unmergedTotalAmount: 0,
    mergedGroupCount: 0,
  });

  // 미병합 클러스터 (테이블 데이터)
  const [clusterData, setClusterData] = useState([]);
  const [clusterPage, setClusterPage] = useState(0);
  const [clusterPageSize, setClusterPageSize] = useState(20);
  const [clusterTotalCount, setClusterTotalCount] = useState(0);
  const [clusterTotalPages, setClusterTotalPages] = useState(0);

  // 선택된 클러스터 (체크박스)
  const [selectedClusters, setSelectedClusters] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  // 테이블 정렬
  const [sort, setSort] = useState(null);

  // 금액 단위
  const [amountUnit, setAmountUnit] = useState('원');

  // 병합 결과
  const [mergedClusters, setMergedClusters] = useState([]);
  const [selectedMergedClusters, setSelectedMergedClusters] = useState([]);

  // 상세 보기 다이얼로그
  const [detailDialog, setDetailDialog] = useState({ open: false, cluster: null });

  // 클러스터명 수정 다이얼로그
  const [renameDialog, setRenameDialog] = useState({ open: false, cluster: null });
  const [newClusterName, setNewClusterName] = useState('');

  // ===== 데이터 로드 =====
  const loadStatistics = useCallback(async () => {
    try {
      const stats = await clusteringService.getStatistics(projectId, sessionId);
      setStatistics(stats);
    } catch (error) {
      console.error('통계 로드 실패:', error);
    }
  }, [projectId, sessionId]);

  const loadUnmergedClusters = useCallback(async () => {
    setLoading(true);
    try {
      const result = await clusteringService.getUnmergedClusters(
        projectId, sessionId, clusterPage, clusterPageSize
      );
      setClusterData(result.data || []);
      setClusterTotalCount(result.totalCount || 0);
      setClusterTotalPages(result.totalPages || 0);
    } catch (error) {
      console.error('클러스터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId, clusterPage, clusterPageSize]);

  const loadMergedClusters = useCallback(async () => {
    try {
      const result = await clusteringService.getMergedClusters(projectId, sessionId);
      setMergedClusters(result || []);
    } catch (error) {
      console.error('병합 클러스터 로드 실패:', error);
    }
  }, [projectId, sessionId]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadStatistics(), loadUnmergedClusters(), loadMergedClusters()]);
  }, [loadStatistics, loadUnmergedClusters, loadMergedClusters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 페이지 변경 시 재로드
  useEffect(() => {
    loadUnmergedClusters();
  }, [clusterPage, clusterPageSize]);

  // ===== 금액 포맷 =====
  const formatAmount = useCallback((amount) => {
    const units = { '원': 1, '천원': 1000, '백만원': 1000000, '억원': 100000000 };
    const divisor = units[amountUnit] || 1;
    return (amount / divisor).toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  }, [amountUnit]);

  // ===== 클러스터 생성 =====
  const handleGenerateClusters = async () => {
    if (!window.confirm('기존 클러스터를 삭제하고 새로 생성합니다. 계속하시겠습니까?')) return;
    setGenerating(true);
    try {
      const result = await clusteringService.generateClusters(projectId, sessionId);
      alert(`클러스터 생성 완료: ${result.clusterCount}개 클러스터 (${result.elapsedMs}ms)`);
      setClusterPage(0);
      setSelectedClusters([]);
      setSelectAll(false);
      await loadAll();
    } catch (error) {
      console.error('클러스터 생성 실패:', error);
      alert('클러스터 생성 실패: ' + (error.response?.data?.message || error.message));
    } finally {
      setGenerating(false);
    }
  };

  // ===== 체크박스 선택 =====
  const handleSelectAll = (checked) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedClusters(clusterData.map(c => c.clusterNumber));
    } else {
      setSelectedClusters([]);
    }
  };

  const handleToggleCluster = (clusterNumber, checked) => {
    if (checked) {
      setSelectedClusters(prev => [...prev, clusterNumber]);
    } else {
      setSelectedClusters(prev => prev.filter(n => n !== clusterNumber));
      setSelectAll(false);
    }
  };

  // ===== 병합 =====
  const handleMerge = async () => {
    if (selectedClusters.length < 2) {
      alert('병합하려면 2개 이상의 클러스터를 선택하세요.');
      return;
    }
    if (!window.confirm(`선택한 ${selectedClusters.length}개 클러스터를 병합하시겠습니까?`)) return;

    try {
      const result = await clusteringService.mergeClusters(projectId, sessionId, selectedClusters);
      alert(`병합 완료: 새 클러스터 #${result.mergedClusterNumber} (${result.mergedCount}개 합침)`);
      setSelectedClusters([]);
      setSelectAll(false);
      await loadAll();
    } catch (error) {
      console.error('병합 실패:', error);
      alert('병합 실패: ' + (error.response?.data?.message || error.message));
    }
  };

  // ===== 병합 해제 =====
  const handleUnmerge = async (mergedClusterNumber) => {
    if (!window.confirm(`클러스터 #${mergedClusterNumber}의 병합을 해제하시겠습니까?`)) return;

    try {
      const result = await clusteringService.unmergeClusters(projectId, sessionId, mergedClusterNumber);
      alert(`병합 해제 완료: ${result.restoredCount}개 클러스터 복원`);
      setSelectedMergedClusters([]);
      await loadAll();
    } catch (error) {
      console.error('병합 해제 실패:', error);
      alert('병합 해제 실패: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleBulkUnmerge = async () => {
    if (selectedMergedClusters.length === 0) {
      alert('병합 해제할 클러스터를 선택하세요.');
      return;
    }
    if (!window.confirm(`선택한 ${selectedMergedClusters.length}개 클러스터의 병합을 해제하시겠습니까?`)) return;

    try {
      for (const cn of selectedMergedClusters) {
        await clusteringService.unmergeClusters(projectId, sessionId, cn);
      }
      alert('병합 해제 완료');
      setSelectedMergedClusters([]);
      await loadAll();
    } catch (error) {
      console.error('병합 해제 실패:', error);
      alert('병합 해제 실패: ' + (error.response?.data?.message || error.message));
    }
  };

  // ===== 클러스터명 수정 =====
  const handleOpenRename = (cluster) => {
    setRenameDialog({ open: true, cluster });
    setNewClusterName(cluster.clusterName);
  };

  const handleRename = async () => {
    if (!newClusterName.trim()) {
      alert('클러스터 이름을 입력하세요.');
      return;
    }
    try {
      await clusteringService.renameCluster(
        projectId, sessionId, renameDialog.cluster.clusterNumber, newClusterName
      );
      setRenameDialog({ open: false, cluster: null });
      await loadAll();
    } catch (error) {
      console.error('이름 변경 실패:', error);
      alert('이름 변경 실패: ' + (error.response?.data?.message || error.message));
    }
  };

  // ===== 상세 보기 =====
  const handleOpenDetail = (cluster) => {
    setDetailDialog({ open: true, cluster });
  };

  // ===== 병합 결과 체크박스 =====
  const handleToggleMergedCluster = (cn, checked) => {
    if (checked) {
      setSelectedMergedClusters(prev => [...prev, cn]);
    } else {
      setSelectedMergedClusters(prev => prev.filter(n => n !== cn));
    }
  };

  // ===== 페이징 =====
  const handlePageChange = (page) => {
    setClusterPage(page);
    setSelectedClusters([]);
    setSelectAll(false);
  };

  // ===== 정렬된 데이터 =====
  const sortedClusterData = useMemo(() => {
    if (!sort) return clusterData;
    const sorted = [...clusterData];
    sorted.sort((a, b) => {
      let aVal = a[sort.field];
      let bVal = b[sort.field];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [clusterData, sort]);

  // ===== AdvancedTable 컬럼 정의 =====
  const clusterColumns = useMemo(() => [
    {
      key: '_checkbox',
      label: '',
      pinned: true,
      sortable: false,
      resizable: false,
      width: 50,
      headerRender: () => (
        <Checkbox
          checked={selectAll}
          onCheckedChange={handleSelectAll}
        />
      ),
      render: (row) => (
        <Checkbox
          checked={selectedClusters.includes(row.clusterNumber)}
          onCheckedChange={(checked) => handleToggleCluster(row.clusterNumber, checked)}
        />
      ),
    },
    {
      key: 'clusterNumber',
      label: '클러스터번호',
      pinned: true,
      sortable: true,
      width: 110,
      render: (row) => (
        <Badge variant="outline" className="text-[10px] font-mono">
          #{row.clusterNumber}
        </Badge>
      ),
    },
    {
      key: 'clusterName',
      label: '클러스터명',
      sortable: true,
      minWidth: 150,
      render: (row) => (
        <span className="whitespace-nowrap">{row.clusterName}</span>
      ),
    },
    {
      key: 'keywords',
      label: '키워드',
      sortable: false,
      minWidth: 200,
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.keywords || []).map((kw, i) => (
            <Badge key={i} variant="secondary" className="text-[10px]">
              {kw}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'count',
      label: 'Count',
      sortable: true,
      width: 90,
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      render: (row) => (
        <span className="block text-right">{(row.count || 0).toLocaleString()}</span>
      ),
    },
    {
      key: 'totalAmount',
      label: `금액(${amountUnit})`,
      sortable: true,
      width: 130,
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      render: (row) => (
        <span className="block text-right">{formatAmount(row.totalAmount || 0)}</span>
      ),
    },
  ], [selectAll, selectedClusters, amountUnit, formatAmount]);

  // ===== 페이징 정보 =====
  const startRow = clusterPage * clusterPageSize + 1;
  const endRow = Math.min((clusterPage + 1) * clusterPageSize, clusterTotalCount);

  // ===== 완료 =====
  const handleComplete = () => {
    navigate(`/projects/${projectId}/sessions/${sessionId}/export`);
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

          {/* 통계 카드 */}
          <Card className="shadow-sm">
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">전체 행수:</span>
                  <Badge variant="secondary">{(statistics.totalRows || 0).toLocaleString()}건</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">미병합 클러스터:</span>
                  <Badge variant="secondary">{(statistics.unmergedCount || 0).toLocaleString()}개</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">미병합 합산 금액:</span>
                  <Badge variant="secondary">
                    {formatAmount(statistics.unmergedTotalAmount || 0)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">병합 그룹:</span>
                  <Badge variant="secondary">{(statistics.mergedGroupCount || 0).toLocaleString()}개</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateClusters}
                  disabled={generating}
                >
                  {generating && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  클러스터 재생성
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측: 미병합 클러스터 테이블 (8/12) */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 테이블 헤더 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold">
                    미병합 클러스터 ({clusterTotalCount.toLocaleString()}건)
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={amountUnit} onValueChange={setAmountUnit}>
                      <SelectTrigger className="w-[100px] h-8 text-xs">
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
                      disabled={selectedClusters.length < 2}
                    >
                      <GitMerge className="h-3 w-3 mr-1" />
                      병합 ({selectedClusters.length})
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                <AdvancedTable
                  columns={clusterColumns}
                  data={sortedClusterData}
                  rowKey={(row) => row.clusterNumber}
                  sort={sort}
                  onSortChange={(field, direction) => setSort({ field, direction })}
                  loading={loading}
                  emptyMessage="클러스터 데이터가 없습니다. 상단의 '클러스터 재생성' 버튼을 클릭하세요."
                />
              </CardContent>

              {/* 페이징 */}
              {clusterTotalPages > 1 && (
                <div className="p-3 border-t bg-white flex-shrink-0">
                  <div className="flex items-center justify-between text-xs">
                    <div className="text-muted-foreground hidden sm:block">
                      {startRow} - {endRow} / 총 {clusterTotalCount.toLocaleString()}건
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                      <Select
                        value={clusterPageSize.toString()}
                        onValueChange={(value) => {
                          setClusterPageSize(Number(value));
                          setClusterPage(0);
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
                          variant="outline" size="sm" className="h-8 px-2"
                          onClick={() => handlePageChange(0)}
                          disabled={clusterPage === 0}
                        >
                          처음
                        </Button>
                        <Button
                          variant="outline" size="sm" className="h-8 px-2"
                          onClick={() => handlePageChange(Math.max(0, clusterPage - 1))}
                          disabled={clusterPage === 0}
                        >
                          이전
                        </Button>
                        <span className="flex items-center px-2 text-xs font-medium">
                          {clusterPage + 1} / {clusterTotalPages}
                        </span>
                        <Button
                          variant="outline" size="sm" className="h-8 px-2"
                          onClick={() => handlePageChange(Math.min(clusterTotalPages - 1, clusterPage + 1))}
                          disabled={clusterPage >= clusterTotalPages - 1}
                        >
                          다음
                        </Button>
                        <Button
                          variant="outline" size="sm" className="h-8 px-2"
                          onClick={() => handlePageChange(clusterTotalPages - 1)}
                          disabled={clusterPage >= clusterTotalPages - 1}
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

          {/* 우측: 병합 결과 (4/12) */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              {/* 병합 결과 확인 */}
              <Card>
                <CardHeader className="py-3 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">
                      병합 결과 확인 ({mergedClusters.length})
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleBulkUnmerge}
                        disabled={selectedMergedClusters.length === 0}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        해제 ({selectedMergedClusters.length})
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {mergedClusters.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                      병합된 클러스터가 없습니다
                    </div>
                  ) : (
                    <div className="overflow-auto max-h-[400px]">
                      <Table>
                        <TableHeader className="bg-gray-100 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="w-[40px] bg-gray-100">
                              <Checkbox disabled />
                            </TableHead>
                            <TableHead className="font-semibold text-xs bg-gray-100">클러스터명</TableHead>
                            <TableHead className="font-semibold text-xs text-right bg-gray-100">Count</TableHead>
                            <TableHead className="font-semibold text-xs text-right bg-gray-100">
                              금액({amountUnit})
                            </TableHead>
                            <TableHead className="font-semibold text-xs bg-gray-100 text-center w-[80px]">
                              관리
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mergedClusters.map((cluster) => (
                            <TableRow key={cluster.clusterNumber} className="hover:bg-muted/50">
                              <TableCell>
                                <Checkbox
                                  checked={selectedMergedClusters.includes(cluster.clusterNumber)}
                                  onCheckedChange={(checked) =>
                                    handleToggleMergedCluster(cluster.clusterNumber, checked)
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-xs">
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-[9px] font-mono">
                                    #{cluster.clusterNumber}
                                  </Badge>
                                  <span className="truncate max-w-[150px]">{cluster.clusterName}</span>
                                </div>
                                <div className="flex flex-wrap gap-0.5 mt-1">
                                  {(cluster.keywords || []).slice(0, 5).map((kw, i) => (
                                    <Badge key={i} variant="secondary" className="text-[8px]">
                                      {kw}
                                    </Badge>
                                  ))}
                                  {(cluster.keywords || []).length > 5 && (
                                    <Badge variant="secondary" className="text-[8px]">
                                      +{cluster.keywords.length - 5}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                {(cluster.count || 0).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                {formatAmount(cluster.totalAmount || 0)}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    size="sm" variant="ghost" className="h-6 w-6 p-0"
                                    onClick={() => handleOpenDetail(cluster)}
                                    title="상세 보기"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost" className="h-6 w-6 p-0"
                                    onClick={() => handleOpenRename(cluster)}
                                    title="이름 변경"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500"
                                    onClick={() => handleUnmerge(cluster.clusterNumber)}
                                    title="병합 해제"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 완료 버튼 */}
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
              클러스터 #{renameDialog.cluster?.clusterNumber}의 새 이름을 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="클러스터 이름"
              value={newClusterName}
              onChange={(e) => setNewClusterName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRenameDialog({ open: false, cluster: null })}
            >
              취소
            </Button>
            <Button onClick={handleRename}>변경</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 상세 보기 다이얼로그 */}
      <Dialog
        open={detailDialog.open}
        onOpenChange={(open) => setDetailDialog({ ...detailDialog, open })}
      >
        <DialogContent className="max-w-[700px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              병합 클러스터 상세: #{detailDialog.cluster?.clusterNumber} {detailDialog.cluster?.clusterName}
            </DialogTitle>
            <DialogDescription>
              병합된 클러스터 내부의 하위 클러스터 목록입니다. ({detailDialog.cluster?.childCount || 0}개)
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="bg-gray-100 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="font-semibold text-xs bg-gray-100">클러스터번호</TableHead>
                  <TableHead className="font-semibold text-xs bg-gray-100">클러스터명</TableHead>
                  <TableHead className="font-semibold text-xs bg-gray-100">키워드</TableHead>
                  <TableHead className="font-semibold text-xs text-right bg-gray-100">Count</TableHead>
                  <TableHead className="font-semibold text-xs text-right bg-gray-100">
                    금액({amountUnit})
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detailDialog.cluster?.children || []).map((sub) => (
                  <TableRow key={sub.clusterNumber} className="hover:bg-muted/50">
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px] font-mono">
                        #{sub.clusterNumber}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{sub.clusterName}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-0.5">
                        {(sub.keywords || []).map((kw, i) => (
                          <Badge key={i} variant="secondary" className="text-[9px]">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {(sub.count || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {formatAmount(sub.totalAmount || 0)}
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
