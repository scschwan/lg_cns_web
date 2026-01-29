// frontend/src/pages/clustering/ClusteringPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Home,
  Plus,
  GitMerge,
  Edit2,
  Trash2,
  FolderOpen,
  ChevronDown,
  ChevronUp
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function ClusteringPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  // ===== 상태 관리 =====
  const [sessionInfo] = useState({
    sessionName: '지급수수료_sample1_2025-10-11',
    totalRecords: 6270,
  });

  // 클러스터 목록
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);

  // 클러스터 상세 데이터
  const [clusterDetail, setClusterDetail] = useState([]);
  const [isDetailCollapsed, setIsDetailCollapsed] = useState(false);

  // 클러스터 병합
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedClusters, setSelectedClusters] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  // 이름 변경 다이얼로그
  const [renameDialog, setRenameDialog] = useState({ open: false, clusterId: null, currentName: '' });
  const [newClusterName, setNewClusterName] = useState('');

  // 삭제 확인 다이얼로그
  const [deleteDialog, setDeleteDialog] = useState({ open: false, clusterId: null, clusterName: '' });

  // ===== Mock 데이터 생성 =====
  const generateClusters = () => {
    const keywords = [
      ['이커머스', '실비', '안분'],
      ['지급수수료', '물류용역'],
      ['인터넷몰', 'SAP'],
      ['더데이걸', '로엠'],
      ['코스트센터', '원가'],
      ['공급업체', '거래처'],
      ['전산비', 'IT'],
      ['광고선전비', '마케팅'],
      ['운반비', '배송'],
      ['임차료', '임대'],
    ];

    return keywords.map((kws, idx) => ({
      id: idx + 1,
      clusterNumber: idx + 1,
      clusterName: kws.join('_'),
      keywords: kws,
      recordCount: Math.floor(Math.random() * 500) + 100,
      totalAmount: Math.floor(Math.random() * 100000000) + 10000000,
      clusterId: -1, // 미병합
      clusterSubId: -1,
    }));
  };

  const generateClusterDetail = (cluster) => {
    const companies = ['더데이걸', '로엠', '포인포인트', '오휴', '핸트메이드'];
    return Array.from({ length: 10 }, (_, idx) => ({
      id: idx + 1,
      processDataId: `pd_${cluster.clusterNumber}_${idx + 1}`,
      keywords: cluster.keywords,
      department: `인터넷몰 ${companies[idx % companies.length]}`,
      supplier: '지급수수료(물류용역)',
      amount: Math.floor(Math.random() * 10000000) + 100000,
    }));
  };

  // ===== useEffect =====
  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    try {
      const clusterData = generateClusters();
      setClusters(clusterData);

      // 첫 번째 클러스터 자동 선택
      if (clusterData.length > 0) {
        handleSelectCluster(clusterData[0]);
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    }
  };

  // ===== 핸들러 함수 =====
  const handleCreateClusters = async () => {
    if (window.confirm('초기 클러스터를 생성하시겠습니까?')) {
      alert('키워드 기반 클러스터링을 실행합니다...');
      // API 호출: POST /api/clustering/create-initial
      loadData(); // 새로고침
    }
  };

  const handleSelectCluster = (cluster) => {
    setSelectedCluster(cluster);
    setClusterDetail(generateClusterDetail(cluster));
    setMergeMode(false);
    setSelectedClusters([]);
  };

  const handleToggleMergeMode = () => {
    setMergeMode(!mergeMode);
    setSelectedClusters([]);
    setSelectAll(false);
  };

  const handleSelectAllClusters = (checked) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedClusters(clusters.map((c) => c.id));
    } else {
      setSelectedClusters([]);
    }
  };

  const handleToggleClusterSelection = (clusterId, checked) => {
    if (checked) {
      setSelectedClusters([...selectedClusters, clusterId]);
    } else {
      setSelectedClusters(selectedClusters.filter((id) => id !== clusterId));
      setSelectAll(false);
    }
  };

  const handleMergeClusters = async () => {
    if (selectedClusters.length < 2) {
      alert('병합할 클러스터를 2개 이상 선택해주세요.');
      return;
    }

    const newName = prompt('병합된 클러스터 이름을 입력하세요:');
    if (!newName) return;

    alert(`${selectedClusters.length}개 클러스터를 [${newName}]로 병합합니다.`);

    // API 호출: POST /api/clustering/merge
    setMergeMode(false);
    setSelectedClusters([]);
    loadData();
  };

  const handleOpenRenameDialog = (cluster) => {
    setRenameDialog({
      open: true,
      clusterId: cluster.id,
      currentName: cluster.clusterName,
    });
    setNewClusterName(cluster.clusterName);
  };

  const handleRenameCluster = async () => {
    if (!newClusterName.trim()) {
      alert('클러스터 이름을 입력해주세요.');
      return;
    }

    alert(`클러스터 이름을 [${newClusterName}]로 변경합니다.`);

    // API 호출: PUT /api/clustering/results/{clusterNumber}/name
    setRenameDialog({ open: false, clusterId: null, currentName: '' });
    loadData();
  };

  const handleOpenDeleteDialog = (cluster) => {
    setDeleteDialog({
      open: true,
      clusterId: cluster.id,
      clusterName: cluster.clusterName,
    });
  };

  const handleDeleteCluster = async () => {
    alert(`클러스터 [${deleteDialog.clusterName}]를 삭제합니다.`);

    // API 호출: DELETE /api/clustering/results/{clusterNumber}
    setDeleteDialog({ open: false, clusterId: null, clusterName: '' });
    setSelectedCluster(null);
    setClusterDetail([]);
    loadData();
  };

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

        {/* 메인 콘텐츠 그리드 (남은 높이 100%) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측: 클러스터 목록 (8/12) */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 상단 툴바 */}
            <Card className="flex-shrink-0 shadow-sm">
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={handleCreateClusters}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      클러스터 생성
                    </Button>

                    <Button
                      size="sm"
                      variant={mergeMode ? 'default' : 'outline'}
                      onClick={handleToggleMergeMode}
                    >
                      <GitMerge className="h-4 w-4 mr-2" />
                      {mergeMode ? '병합 취소' : '병합 모드'}
                    </Button>

                    {mergeMode && (
                      <Button
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700"
                        onClick={handleMergeClusters}
                        disabled={selectedClusters.length < 2}
                      >
                        선택 병합 ({selectedClusters.length})
                      </Button>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    총 {clusters.length}개 클러스터
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 클러스터 목록 (그리드) */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>클러스터 목록</span>
                  {mergeMode && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all"
                        checked={selectAll}
                        onCheckedChange={handleSelectAllClusters}
                      />
                      <label htmlFor="select-all" className="text-xs font-normal cursor-pointer">
                        전체 선택
                      </label>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>

              <CardContent className="p-0 flex-1 relative min-h-0">
                <div className="absolute inset-0 overflow-auto custom-scrollbar p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {clusters.map((cluster) => (
                      <Card
                        key={cluster.id}
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          selectedCluster?.id === cluster.id
                            ? 'border-2 border-blue-500 bg-blue-50'
                            : 'border hover:border-gray-400'
                        }`}
                        onClick={() => !mergeMode && handleSelectCluster(cluster)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {mergeMode && (
                                <Checkbox
                                  checked={selectedClusters.includes(cluster.id)}
                                  onCheckedChange={(checked) => handleToggleClusterSelection(cluster.id, checked)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                              <Badge variant="outline" className="text-xs">
                                #{cluster.clusterNumber}
                              </Badge>
                            </div>
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          </div>

                          <h3 className="font-semibold text-sm mb-2 line-clamp-1">
                            {cluster.clusterName}
                          </h3>

                          <div className="flex flex-wrap gap-1 mb-3">
                            {cluster.keywords.slice(0, 3).map((kw, idx) => (
                              <Badge key={idx} variant="secondary" className="text-[10px]">
                                {kw}
                              </Badge>
                            ))}
                            {cluster.keywords.length > 3 && (
                              <Badge variant="secondary" className="text-[10px]">
                                +{cluster.keywords.length - 3}
                              </Badge>
                            )}
                          </div>

                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex justify-between">
                              <span>레코드:</span>
                              <span className="font-medium">{cluster.recordCount.toLocaleString()}건</span>
                            </div>
                            <div className="flex justify-between">
                              <span>합계:</span>
                              <span className="font-medium">
                                {(cluster.totalAmount / 1000000).toFixed(1)}백만원
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 우측: 클러스터 상세 + 관리 (4/12) */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">

            {/* 설정 패널 (스크롤 가능) */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              {/* 클러스터 상세 정보 */}
              {selectedCluster && (
                <Card>
                  <CardHeader className="py-3 border-b">
                    <CardTitle className="text-sm font-bold flex items-center justify-between">
                      <span>클러스터 상세</span>
                      <Badge variant="outline">#{selectedCluster.clusterNumber}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block">클러스터 이름</label>
                      <div className="text-sm">{selectedCluster.clusterName}</div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold mb-1 block">키워드</label>
                      <div className="flex flex-wrap gap-1">
                        {selectedCluster.keywords.map((kw, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px]">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">레코드 수</div>
                        <div className="text-lg font-bold">
                          {selectedCluster.recordCount.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">합계 금액</div>
                        <div className="text-lg font-bold">
                          {(selectedCluster.totalAmount / 1000000).toFixed(1)}M
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 클러스터 데이터 미리보기 */}
              {selectedCluster && (
                <Card className="flex-shrink-0">
                  <CardHeader
                    className="py-3 px-4 border-b bg-white cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setIsDetailCollapsed(!isDetailCollapsed)}
                  >
                    <CardTitle className="text-sm font-bold flex items-center justify-between">
                      <span>데이터 미리보기</span>
                      {isDetailCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>

                  {!isDetailCollapsed && (
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[250px] custom-scrollbar">
                        <Table>
                          <TableHeader className="bg-gray-100 sticky top-0 z-10">
                            <TableRow>
                              <TableHead className="font-semibold text-xs bg-gray-100">부서</TableHead>
                              <TableHead className="font-semibold text-xs text-right bg-gray-100">금액</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clusterDetail.map((row) => (
                              <TableRow key={row.id} className="hover:bg-muted/50">
                                <TableCell className="text-xs">{row.department}</TableCell>
                                <TableCell className="text-xs text-right">
                                  {row.amount.toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              )}

              {/* 클러스터 관리 */}
              {selectedCluster && (
                <Card>
                  <CardHeader className="py-3 border-b">
                    <CardTitle className="text-sm font-bold">클러스터 관리</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => handleOpenRenameDialog(selectedCluster)}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      이름 변경
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleOpenDeleteDialog(selectedCluster)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      클러스터 삭제
                    </Button>
                  </CardContent>
                </Card>
              )}
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

      {/* 이름 변경 다이얼로그 */}
      <Dialog open={renameDialog.open} onOpenChange={(open) => setRenameDialog({ ...renameDialog, open })}>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog({ open: false, clusterId: null, currentName: '' })}>
              취소
            </Button>
            <Button onClick={handleRenameCluster}>
              변경
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>클러스터 삭제</DialogTitle>
            <DialogDescription>
              정말로 클러스터 <strong>{deleteDialog.clusterName}</strong>를 삭제하시겠습니까?
              <br />
              <span className="text-red-600">이 작업은 되돌릴 수 없습니다.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, clusterId: null, clusterName: '' })}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDeleteCluster}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClusteringPage;