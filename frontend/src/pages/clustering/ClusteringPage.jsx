// frontend/src/pages/clustering/ClusteringPage.jsx
//
// Step 5: Clustering 페이지
// - 좌측(8/12): 통계 카드 → 검색 → 미병합 클러스터 테이블 (AdvancedTable + 동적 컬럼 + 대표데이터 + 페이징)
// - 우측(4/12): 키워드/공급업체 통계 탭 → 병합 클러스터링 버튼 → 병합 결과 테이블 → 완료 버튼
// - 체크박스: selectAllMode + exceptions 패턴 (페이지 간 지속)

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Home,
  GitMerge,
  Eye,
  Edit2,
  RotateCcw,
  Loader2,
  Search,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import AdvancedTable from '@/components/AdvancedTable';
import clusteringService from '@/services/clusteringService';
import uploadService from '@/services/uploadService';

// ============================================================
// 페이징 컴포넌트
// ============================================================
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

// ============================================================
// 멀티셀렉트 체크박스 리스트 (드래그 + Ctrl 복수선택)
// ============================================================
function MultiSelectCheckList({ items, checkedSet, onCheckedChange, renderLabel, getKey, className = '' }) {
  const [cursorSet, setCursorSet] = useState(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(null);

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

  const handleMouseUp = () => setIsDragging(false);

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
    <div className={`select-none ${className}`} onMouseUp={handleMouseUp}>
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

// ============================================================
// 메인 ClusteringPage
// ============================================================
function ClusteringPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  // ===== 기본 상태 =====
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ===== 통계 =====
  const [statistics, setStatistics] = useState({
    totalRows: 0, unmergedCount: 0, unmergedTotalAmount: 0, mergedGroupCount: 0, hasSupplier: false,
  });

  // ===== 금액 단위 =====
  const [amountUnit, setAmountUnit] = useState('원');
  const amountDivisor = { '원': 1, '천원': 1000, '백만원': 1000000, '억원': 100000000 };

  // ===== 검색 =====
  const [searchKeyword, setSearchKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState(null);

  // ===== 미병합 클러스터 테이블 =====
  const [clusterData, setClusterData] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [clusterPage, setClusterPage] = useState(0);
  const [clusterPageSize, setClusterPageSize] = useState(20);
  const [clusterTotalCount, setClusterTotalCount] = useState(0);
  const [clusterTotalPages, setClusterTotalPages] = useState(0);
  const [sort, setSort] = useState(null);

  // ===== 체크박스 (selectAllMode + exceptions 패턴) =====
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [exceptions, setExceptions] = useState(new Set());

  // ===== 우측 사이드바 탭 =====
  const [activeTab, setActiveTab] = useState('keyword');

  // ===== 키워드 통계 =====
  const [keywordStats, setKeywordStats] = useState([]);
  const [kwStatsLoading, setKwStatsLoading] = useState(false);
  const [kwCheckedSet, setKwCheckedSet] = useState(new Set());
  const [kwSortField, setKwSortField] = useState('count');
  const [kwSortDir, setKwSortDir] = useState('desc');

  // ===== 공급업체 통계 =====
  const [supplierStats, setSupplierStats] = useState([]);
  const [supStatsLoading, setSupStatsLoading] = useState(false);
  const [supCheckedSet, setSupCheckedSet] = useState(new Set());
  const [supSortField, setSupSortField] = useState('count');
  const [supSortDir, setSupSortDir] = useState('desc');

  // ===== 병합 결과 =====
  const [mergedClusters, setMergedClusters] = useState([]);
  const [selectedMergedClusters, setSelectedMergedClusters] = useState([]);

  // ===== 다이얼로그 =====
  const [detailDialog, setDetailDialog] = useState({ open: false, cluster: null });
  const [renameDialog, setRenameDialog] = useState({ open: false, cluster: null });
  const [newClusterName, setNewClusterName] = useState('');

  // ============================================================
  // 금액 포맷
  // ============================================================
  const formatAmount = useCallback((amount) => {
    if (amount == null || isNaN(amount)) return '0';
    const value = amount / amountDivisor[amountUnit];
    if (amountUnit === '원') return Math.round(value).toLocaleString();
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }, [amountUnit]);

  // ============================================================
  // 데이터 로드
  // ============================================================
  const loadStatistics = useCallback(async () => {
    try {
      const stats = await clusteringService.getStatistics(projectId, sessionId);
      setStatistics(stats);
    } catch (error) {
      console.error('통계 로드 실패:', error);
    }
  }, [projectId, sessionId]);

  const loadUnmergedClusters = useCallback(async (page, size, keyword) => {
    setLoading(true);
    try {
      const result = await clusteringService.getUnmergedClusters(projectId, sessionId, page, size, keyword);
      setClusterData(result.data || []);
      setVisibleColumns(result.columns || []);
      setClusterTotalCount(result.totalCount || 0);
      setClusterTotalPages(result.totalPages || 0);
    } catch (error) {
      console.error('클러스터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId]);

  const loadKeywordStats = useCallback(async () => {
    setKwStatsLoading(true);
    try {
      const stats = await clusteringService.getKeywordStats(projectId, sessionId);
      setKeywordStats(stats || []);
    } catch (error) {
      console.error('키워드 통계 로드 실패:', error);
    } finally {
      setKwStatsLoading(false);
    }
  }, [projectId, sessionId]);

  const loadSupplierStats = useCallback(async () => {
    setSupStatsLoading(true);
    try {
      const stats = await clusteringService.getSupplierStats(projectId, sessionId);
      setSupplierStats(stats || []);
    } catch (error) {
      console.error('공급업체 통계 로드 실패:', error);
    } finally {
      setSupStatsLoading(false);
    }
  }, [projectId, sessionId]);

  const loadMergedClusters = useCallback(async () => {
    try {
      const result = await clusteringService.getMergedClusters(projectId, sessionId);
      setMergedClusters(result || []);
    } catch (error) {
      console.error('병합 클러스터 로드 실패:', error);
    }
  }, [projectId, sessionId]);

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadStatistics(),
      loadUnmergedClusters(0, clusterPageSize, null),
      loadKeywordStats(),
      loadSupplierStats(),
      loadMergedClusters(),
    ]);
  }, [loadStatistics, loadUnmergedClusters, clusterPageSize, loadKeywordStats, loadSupplierStats, loadMergedClusters]);

  useEffect(() => {
    loadAll();
  }, [projectId, sessionId]);

  // ============================================================
  // 검색
  // ============================================================
  const handleSearch = () => {
    const kw = searchKeyword.trim() || null;
    setAppliedKeyword(kw);
    setClusterPage(0);
    // 검색 시 체크 초기화
    setSelectAllMode(false);
    setExceptions(new Set());
    loadUnmergedClusters(0, clusterPageSize, kw);
  };

  const handleClearSearch = () => {
    setSearchKeyword('');
    setAppliedKeyword(null);
    setClusterPage(0);
    setSelectAllMode(false);
    setExceptions(new Set());
    loadUnmergedClusters(0, clusterPageSize, null);
  };

  // ============================================================
  // 페이징
  // ============================================================
  const handlePageChange = (page) => {
    setClusterPage(page);
    loadUnmergedClusters(page, clusterPageSize, appliedKeyword);
  };

  const handlePageSizeChange = (size) => {
    setClusterPageSize(size);
    setClusterPage(0);
    loadUnmergedClusters(0, size, appliedKeyword);
  };

  // ============================================================
  // 체크박스 로직 (selectAllMode + exceptions)
  // ============================================================
  const isRowChecked = useCallback((clusterNumber) => {
    if (selectAllMode) {
      return !exceptions.has(clusterNumber);
    }
    return exceptions.has(clusterNumber);
  }, [selectAllMode, exceptions]);

  const handleHeaderCheckChange = async (checked) => {
    if (checked) {
      // 전체 선택: selectAllMode = true, exceptions 비우기
      setSelectAllMode(true);
      setExceptions(new Set());
    } else {
      // 전체 해제
      setSelectAllMode(false);
      setExceptions(new Set());
    }
  };

  const handleRowCheckChange = (clusterNumber, checked) => {
    setExceptions(prev => {
      const next = new Set(prev);
      if (selectAllMode) {
        // selectAll 모드: 체크 해제 → exceptions에 추가, 체크 → exceptions에서 제거
        if (checked) next.delete(clusterNumber);
        else next.add(clusterNumber);
      } else {
        // 개별 모드: 체크 → exceptions에 추가, 체크 해제 → exceptions에서 제거
        if (checked) next.add(clusterNumber);
        else next.delete(clusterNumber);
      }
      return next;
    });
  };

  // 실제 선택된 개수 계산
  const selectedCount = useMemo(() => {
    if (selectAllMode) {
      return clusterTotalCount - exceptions.size;
    }
    return exceptions.size;
  }, [selectAllMode, exceptions, clusterTotalCount]);

  // 헤더 체크 상태
  const isHeaderChecked = useMemo(() => {
    if (clusterTotalCount === 0) return false;
    return selectAllMode && exceptions.size === 0;
  }, [selectAllMode, exceptions, clusterTotalCount]);

  const isHeaderIndeterminate = useMemo(() => {
    if (selectAllMode && exceptions.size > 0 && exceptions.size < clusterTotalCount) return true;
    if (!selectAllMode && exceptions.size > 0 && exceptions.size < clusterTotalCount) return true;
    return false;
  }, [selectAllMode, exceptions, clusterTotalCount]);

  // 선택된 클러스터 번호 가져오기 (병합 실행 시)
  const getSelectedClusterNumbers = useCallback(async () => {
    if (selectAllMode) {
      // 전체에서 exceptions를 뺀 목록
      const allIds = await clusteringService.getAllUnmergedClusterNumbers(projectId, sessionId, appliedKeyword);
      return allIds.filter(id => !exceptions.has(id));
    }
    return Array.from(exceptions);
  }, [selectAllMode, exceptions, projectId, sessionId, appliedKeyword]);

  // ============================================================
  // 클러스터 재생성
  // ============================================================
  const handleGenerateClusters = async () => {
    if (!window.confirm('기존 클러스터를 삭제하고 새로 생성합니다. 계속하시겠습니까?')) return;
    setGenerating(true);
    try {
      const result = await clusteringService.generateClusters(projectId, sessionId);
      alert(`클러스터 생성 완료: ${result.clusterCount}개 클러스터 (${result.elapsedMs}ms)`);
      setClusterPage(0);
      setSelectAllMode(false);
      setExceptions(new Set());
      setAppliedKeyword(null);
      setSearchKeyword('');
      await loadAll();
    } catch (error) {
      console.error('클러스터 생성 실패:', error);
      alert('클러스터 생성 실패: ' + (error.response?.data?.message || error.message));
    } finally {
      setGenerating(false);
    }
  };

  // ============================================================
  // 병합 (미병합 테이블에서 선택한 항목)
  // ============================================================
  const [merging, setMerging] = useState(false);

  const handleMerge = async () => {
    if (selectedCount < 2) {
      alert('병합하려면 2개 이상의 클러스터를 선택하세요.');
      return;
    }
    if (!window.confirm(`선택한 ${selectedCount}개 클러스터를 병합하시겠습니까?`)) return;

    setMerging(true);
    try {
      const clusterNumbers = await getSelectedClusterNumbers();
      const result = await clusteringService.mergeClusters(projectId, sessionId, clusterNumbers);
      alert(`병합 완료: 새 클러스터 #${result.mergedClusterNumber} (${result.mergedCount}개 합침)`);
      setSelectAllMode(false);
      setExceptions(new Set());
      await Promise.all([
        loadStatistics(),
        loadUnmergedClusters(clusterPage, clusterPageSize, appliedKeyword),
        loadKeywordStats(),
        loadSupplierStats(),
        loadMergedClusters(),
      ]);
    } catch (error) {
      console.error('병합 실패:', error);
      alert('병합 실패: ' + (error.response?.data?.message || error.message));
    } finally {
      setMerging(false);
    }
  };

  // ============================================================
  // 키워드 통계 "자세히" → 해당 키워드로 검색
  // ============================================================
  const handleKeywordDetail = (keyword) => {
    setSearchKeyword(keyword);
    setAppliedKeyword(keyword);
    setClusterPage(0);
    setSelectAllMode(false);
    setExceptions(new Set());
    loadUnmergedClusters(0, clusterPageSize, keyword);
  };

  // ============================================================
  // "선택항목 자동 클러스터링" → 키워드 통계에서 체크한 키워드에 속하는 클러스터 병합
  // ============================================================
  const handleAutoMergeByKeywords = async () => {
    if (kwCheckedSet.size === 0) {
      alert('키워드를 선택해주세요.');
      return;
    }
    if (!window.confirm(`선택한 ${kwCheckedSet.size}개 키워드에 속하는 클러스터를 자동 병합합니다.`)) return;

    setMerging(true);
    try {
      // 각 키워드별로 해당 클러스터를 가져와서 병합
      for (const keyword of kwCheckedSet) {
        const ids = await clusteringService.getAllUnmergedClusterNumbers(projectId, sessionId, keyword);
        if (ids.length >= 2) {
          await clusteringService.mergeClusters(projectId, sessionId, ids);
        }
      }
      alert('자동 클러스터링 완료');
      setKwCheckedSet(new Set());
      setSelectAllMode(false);
      setExceptions(new Set());
      await Promise.all([
        loadStatistics(),
        loadUnmergedClusters(clusterPage, clusterPageSize, appliedKeyword),
        loadKeywordStats(),
        loadSupplierStats(),
        loadMergedClusters(),
      ]);
    } catch (error) {
      console.error('자동 클러스터링 실패:', error);
      alert('자동 클러스터링 실패: ' + (error.response?.data?.message || error.message));
    } finally {
      setMerging(false);
    }
  };

  // ============================================================
  // "선택항목 자동 클러스터링" → 공급업체 통계 기준
  // ============================================================
  const handleAutoMergeBySuppliers = async () => {
    if (supCheckedSet.size === 0) {
      alert('공급업체를 선택해주세요.');
      return;
    }
    alert('공급업체 기준 자동 클러스터링은 키워드 기준과 동일한 로직으로 추후 확장됩니다.');
  };

  // ============================================================
  // 병합 해제
  // ============================================================
  const handleUnmerge = async (mergedClusterNumber) => {
    if (!window.confirm(`클러스터 #${mergedClusterNumber}의 병합을 해제하시겠습니까?`)) return;
    try {
      const result = await clusteringService.unmergeClusters(projectId, sessionId, mergedClusterNumber);
      alert(`병합 해제 완료: ${result.restoredCount}개 클러스터 복원`);
      setSelectedMergedClusters([]);
      await Promise.all([
        loadStatistics(),
        loadUnmergedClusters(clusterPage, clusterPageSize, appliedKeyword),
        loadKeywordStats(),
        loadSupplierStats(),
        loadMergedClusters(),
      ]);
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
      await Promise.all([
        loadStatistics(),
        loadUnmergedClusters(clusterPage, clusterPageSize, appliedKeyword),
        loadKeywordStats(),
        loadSupplierStats(),
        loadMergedClusters(),
      ]);
    } catch (error) {
      console.error('병합 해제 실패:', error);
      alert('병합 해제 실패: ' + (error.response?.data?.message || error.message));
    }
  };

  // ============================================================
  // 클러스터명 수정
  // ============================================================
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
      await Promise.all([
        loadUnmergedClusters(clusterPage, clusterPageSize, appliedKeyword),
        loadMergedClusters(),
      ]);
    } catch (error) {
      console.error('이름 변경 실패:', error);
      alert('이름 변경 실패: ' + (error.response?.data?.message || error.message));
    }
  };

  // ============================================================
  // 상세 보기
  // ============================================================
  const handleOpenDetail = (cluster) => {
    setDetailDialog({ open: true, cluster });
  };

  // ============================================================
  // 병합 결과 체크박스
  // ============================================================
  const handleToggleMergedCluster = (cn, checked) => {
    if (checked) {
      setSelectedMergedClusters(prev => [...prev, cn]);
    } else {
      setSelectedMergedClusters(prev => prev.filter(n => n !== cn));
    }
  };

  // ============================================================
  // 키워드 통계 정렬
  // ============================================================
  const handleKwStatsSort = (field) => {
    if (kwSortField === field) setKwSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setKwSortField(field); setKwSortDir('desc'); }
  };

  const sortedKeywordStats = useMemo(() => {
    const sorted = [...keywordStats];
    sorted.sort((a, b) => {
      let aVal, bVal;
      if (kwSortField === 'keyword') {
        aVal = a.keyword || ''; bVal = b.keyword || '';
        return kwSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      aVal = a[kwSortField] || 0; bVal = b[kwSortField] || 0;
      return kwSortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [keywordStats, kwSortField, kwSortDir]);

  // ============================================================
  // 공급업체 통계 정렬
  // ============================================================
  const handleSupStatsSort = (field) => {
    if (supSortField === field) setSupSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSupSortField(field); setSupSortDir('desc'); }
  };

  const sortedSupplierStats = useMemo(() => {
    const sorted = [...supplierStats];
    sorted.sort((a, b) => {
      let aVal, bVal;
      if (supSortField === 'supplier') {
        aVal = a.supplier || ''; bVal = b.supplier || '';
        return supSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      aVal = a[supSortField] || 0; bVal = b[supSortField] || 0;
      return supSortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [supplierStats, supSortField, supSortDir]);

  const SortIcon = ({ field, currentField, currentDir }) => {
    if (currentField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return currentDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // ============================================================
  // AdvancedTable 컬럼 빌드 (고정 + 동적)
  // ============================================================
  const clusterColumns = useMemo(() => {
    const cols = [
      // 체크박스
      {
        key: '_checkbox',
        label: '',
        pinned: true,
        sortable: false,
        resizable: false,
        width: 50,
        headerRender: () => (
          <Checkbox
            checked={isHeaderChecked}
            ref={(el) => { if (el) el.indeterminate = isHeaderIndeterminate; }}
            onCheckedChange={handleHeaderCheckChange}
          />
        ),
        render: (row) => (
          <Checkbox
            checked={isRowChecked(row.clusterNumber)}
            onCheckedChange={(checked) => handleRowCheckChange(row.clusterNumber, checked)}
          />
        ),
      },
      // 클러스터번호
      {
        key: 'clusterNumber',
        label: '클러스터번호',
        pinned: true,
        sortable: true,
        width: 110,
        render: (row) => (
          <Badge variant="outline" className="text-[10px] font-mono">#{row.clusterNumber}</Badge>
        ),
      },
      // 클러스터명
      {
        key: 'clusterName',
        label: '클러스터명',
        sortable: true,
        minWidth: 150,
        render: (row) => <span className="whitespace-nowrap">{row.clusterName}</span>,
      },
      // 키워드
      {
        key: 'keywords',
        label: '키워드',
        sortable: false,
        minWidth: 200,
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            {(row.keywords || []).map((kw, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">{kw}</Badge>
            ))}
          </div>
        ),
      },
      // Count
      {
        key: 'count',
        label: 'Count',
        sortable: true,
        width: 90,
        cellClassName: 'text-right',
        headerClassName: 'text-right',
        render: (row) => <span className="block text-right">{(row.count || 0).toLocaleString()}</span>,
      },
      // 합산금액
      {
        key: 'totalAmount',
        label: `금액(${amountUnit})`,
        sortable: true,
        width: 130,
        cellClassName: 'text-right',
        headerClassName: 'text-right',
        render: (row) => <span className="block text-right">{formatAmount(row.totalAmount || 0)}</span>,
      },
    ];

    // 동적 컬럼 (column_mapping is_visible)
    if (visibleColumns && visibleColumns.length > 0) {
      for (const colName of visibleColumns) {
        cols.push({
          key: `rep_${colName}`,
          label: colName,
          sortable: false,
          minWidth: 100,
          render: (row) => {
            const repData = row.representativeData || {};
            const val = repData[colName];
            return <span className="whitespace-nowrap text-xs">{val != null ? String(val) : ''}</span>;
          },
        });
      }
    }

    return cols;
  }, [isHeaderChecked, isHeaderIndeterminate, selectAllMode, exceptions, visibleColumns, amountUnit, formatAmount]);

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

  // ===== 완료 =====
  const handleComplete = async () => {
    try {
      await uploadService.updateStepHistory(projectId, sessionId, 6);
    } catch (e) {
      console.error('step_history 업데이트 실패:', e);
    }
    navigate(`/projects/${projectId}/sessions/${sessionId}/export`);
  };

  // ============================================================
  // 렌더링
  // ============================================================
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">

        {/* 상단 헤더 */}
        <div className="flex-shrink-0 space-y-4 mb-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/projects"><Home className="h-4 w-4" /></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/projects/${projectId}/upload`}>프로젝트</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold">Step 5: Clustering</BreadcrumbPage>
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
                  <Badge variant="secondary">{formatAmount(statistics.unmergedTotalAmount || 0)}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">병합 그룹:</span>
                  <Badge variant="secondary">{(statistics.mergedGroupCount || 0).toLocaleString()}개</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={handleGenerateClusters} disabled={generating}>
                  {generating && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  클러스터 재생성
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 메인 콘텐츠 그리드 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* ========== 좌측: 검색 + 미병합 클러스터 테이블 (8/12) ========== */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 검색 섹션 */}
            <Card className="flex-shrink-0 shadow-sm">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 text-sm flex-1"
                    placeholder="키워드로 클러스터 검색..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  />
                  <Button size="sm" className="h-8" onClick={handleSearch}>
                    <Search className="h-3 w-3 mr-1" />검색
                  </Button>
                  {appliedKeyword && (
                    <Button size="sm" variant="outline" className="h-8" onClick={handleClearSearch}>
                      초기화
                    </Button>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <Select value={amountUnit} onValueChange={setAmountUnit}>
                      <SelectTrigger className="w-[80px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="원">원</SelectItem>
                        <SelectItem value="천원">천원</SelectItem>
                        <SelectItem value="백만원">백만원</SelectItem>
                        <SelectItem value="억원">억원</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={handleMerge} disabled={selectedCount < 2 || merging}>
                      {merging && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      <GitMerge className="h-3 w-3 mr-1" />
                      병합 ({selectedCount})
                    </Button>
                  </div>
                </div>
                {appliedKeyword && (
                  <div className="mt-2">
                    <Badge variant="secondary" className="text-[10px]">
                      검색: {appliedKeyword}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-2">
                      {clusterTotalCount.toLocaleString()}건 조회
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 미병합 클러스터 테이블 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <CardTitle className="text-sm font-bold">
                  미병합 클러스터 ({clusterTotalCount.toLocaleString()}건)
                </CardTitle>
              </CardHeader>

              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                <AdvancedTable
                  columns={clusterColumns}
                  data={sortedClusterData}
                  rowKey={(row) => row.clusterNumber}
                  sort={sort}
                  onSortChange={(field, direction) => setSort({ field, direction })}
                  loading={loading}
                  emptyMessage="클러스터 데이터가 없습니다."
                />
              </CardContent>

              <Pagination
                currentPage={clusterPage}
                totalPages={clusterTotalPages}
                totalCount={clusterTotalCount}
                pageSize={clusterPageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </Card>
          </div>

          {/* ========== 우측: 키워드/공급업체 통계 + 병합 결과 (4/12) ========== */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              {/* 키워드 / 공급업체 통계 탭 */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className={`grid w-full ${statistics.hasSupplier ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <TabsTrigger value="keyword">키워드별</TabsTrigger>
                  {statistics.hasSupplier && <TabsTrigger value="supplier">공급업체별</TabsTrigger>}
                </TabsList>

                {/* ===== 키워드 통계 탭 ===== */}
                <TabsContent value="keyword" className="mt-3">
                  <Card>
                    <CardHeader className="py-3 border-b">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold">
                          키워드 통계 ({keywordStats.length}건)
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="h-7 px-2"
                          onClick={loadKeywordStats} disabled={kwStatsLoading}>
                          <RefreshCw className={`h-3 w-3 ${kwStatsLoading ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[calc(100vh-600px)] custom-scrollbar">
                        <Table>
                          <TableHeader className="bg-gray-100 sticky top-0 z-10">
                            <TableRow>
                              <TableHead className="w-[30px] bg-gray-100"></TableHead>
                              <TableHead className="font-semibold text-xs bg-gray-100 cursor-pointer select-none"
                                onClick={() => handleKwStatsSort('keyword')}>
                                <div className="flex items-center">키워드
                                  <SortIcon field="keyword" currentField={kwSortField} currentDir={kwSortDir} />
                                </div>
                              </TableHead>
                              <TableHead className="font-semibold text-xs text-right bg-gray-100 cursor-pointer select-none"
                                onClick={() => handleKwStatsSort('count')}>
                                <div className="flex items-center justify-end">Count
                                  <SortIcon field="count" currentField={kwSortField} currentDir={kwSortDir} />
                                </div>
                              </TableHead>
                              <TableHead className="font-semibold text-xs text-right bg-gray-100 cursor-pointer select-none"
                                onClick={() => handleKwStatsSort('totalAmount')}>
                                <div className="flex items-center justify-end">합계({amountUnit})
                                  <SortIcon field="totalAmount" currentField={kwSortField} currentDir={kwSortDir} />
                                </div>
                              </TableHead>
                              <TableHead className="w-[50px] bg-gray-100"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedKeywordStats.length === 0 && !kwStatsLoading ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                                  키워드 통계가 없습니다
                                </TableCell>
                              </TableRow>
                            ) : (
                              <MultiSelectCheckList
                                items={sortedKeywordStats}
                                checkedSet={kwCheckedSet}
                                onCheckedChange={setKwCheckedSet}
                                getKey={(item) => item.keyword}
                                renderLabel={(item) => (
                                  <div className="flex items-center w-full text-xs">
                                    <div className="flex-1 min-w-0">
                                      <Badge variant="outline" className="text-[10px] font-medium">
                                        {item.keyword}
                                      </Badge>
                                    </div>
                                    <span className="text-right w-[60px] flex-shrink-0">
                                      {(item.count || 0).toLocaleString()}
                                    </span>
                                    <span className="text-right w-[80px] flex-shrink-0 ml-2">
                                      {formatAmount(item.totalAmount || 0)}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[10px] text-blue-600 hover:text-blue-800 hover:bg-blue-100 ml-1 flex-shrink-0"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleKeywordDetail(item.keyword);
                                      }}
                                    >
                                      자세히
                                    </Button>
                                  </div>
                                )}
                              />
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 선택항목 자동 클러스터링 버튼 */}
                  <Button
                    className="w-full mt-3 bg-purple-600 hover:bg-purple-700 h-9 text-sm font-semibold"
                    onClick={handleAutoMergeByKeywords}
                    disabled={kwCheckedSet.size === 0 || merging}
                  >
                    {merging && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    <GitMerge className="h-3 w-3 mr-1" />
                    선택항목 자동 클러스터링 ({kwCheckedSet.size})
                  </Button>
                </TabsContent>

                {/* ===== 공급업체 통계 탭 ===== */}
                {statistics.hasSupplier && (
                  <TabsContent value="supplier" className="mt-3">
                    <Card>
                      <CardHeader className="py-3 border-b">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-bold">
                            공급업체 통계 ({supplierStats.length}건)
                          </CardTitle>
                          <Button variant="ghost" size="sm" className="h-7 px-2"
                            onClick={loadSupplierStats} disabled={supStatsLoading}>
                            <RefreshCw className={`h-3 w-3 ${supStatsLoading ? 'animate-spin' : ''}`} />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-auto max-h-[calc(100vh-600px)] custom-scrollbar">
                          <Table>
                            <TableHeader className="bg-gray-100 sticky top-0 z-10">
                              <TableRow>
                                <TableHead className="w-[30px] bg-gray-100"></TableHead>
                                <TableHead className="font-semibold text-xs bg-gray-100 cursor-pointer select-none"
                                  onClick={() => handleSupStatsSort('supplier')}>
                                  <div className="flex items-center">공급업체
                                    <SortIcon field="supplier" currentField={supSortField} currentDir={supSortDir} />
                                  </div>
                                </TableHead>
                                <TableHead className="font-semibold text-xs text-right bg-gray-100 cursor-pointer select-none"
                                  onClick={() => handleSupStatsSort('count')}>
                                  <div className="flex items-center justify-end">Count
                                    <SortIcon field="count" currentField={supSortField} currentDir={supSortDir} />
                                  </div>
                                </TableHead>
                                <TableHead className="font-semibold text-xs text-right bg-gray-100 cursor-pointer select-none"
                                  onClick={() => handleSupStatsSort('totalAmount')}>
                                  <div className="flex items-center justify-end">합계({amountUnit})
                                    <SortIcon field="totalAmount" currentField={supSortField} currentDir={supSortDir} />
                                  </div>
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sortedSupplierStats.length === 0 && !supStatsLoading ? (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">
                                    공급업체 통계가 없습니다
                                  </TableCell>
                                </TableRow>
                              ) : (
                                <MultiSelectCheckList
                                  items={sortedSupplierStats}
                                  checkedSet={supCheckedSet}
                                  onCheckedChange={setSupCheckedSet}
                                  getKey={(item) => item.supplier}
                                  renderLabel={(item) => (
                                    <div className="flex items-center w-full text-xs">
                                      <div className="flex-1 min-w-0">
                                        <Badge variant="outline" className="text-[10px] font-medium">
                                          {item.supplier}
                                        </Badge>
                                      </div>
                                      <span className="text-right w-[60px] flex-shrink-0">
                                        {(item.count || 0).toLocaleString()}
                                      </span>
                                      <span className="text-right w-[80px] flex-shrink-0 ml-2">
                                        {formatAmount(item.totalAmount || 0)}
                                      </span>
                                    </div>
                                  )}
                                />
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>

                    <Button
                      className="w-full mt-3 bg-purple-600 hover:bg-purple-700 h-9 text-sm font-semibold"
                      onClick={handleAutoMergeBySuppliers}
                      disabled={supCheckedSet.size === 0 || merging}
                    >
                      {merging && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      <GitMerge className="h-3 w-3 mr-1" />
                      선택항목 자동 클러스터링 ({supCheckedSet.size})
                    </Button>
                  </TabsContent>
                )}
              </Tabs>

              {/* 병합 결과 확인 */}
              <Card>
                <CardHeader className="py-3 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">
                      병합 결과 확인 ({mergedClusters.length})
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline"
                        onClick={handleBulkUnmerge}
                        disabled={selectedMergedClusters.length === 0}>
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
                    <div className="overflow-auto max-h-[300px]">
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
                            <TableHead className="font-semibold text-xs bg-gray-100 text-center w-[80px]">관리</TableHead>
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
                                    <Badge key={i} variant="secondary" className="text-[8px]">{kw}</Badge>
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
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                    onClick={() => handleOpenDetail(cluster)} title="상세 보기">
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                    onClick={() => handleOpenRename(cluster)} title="이름 변경">
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500"
                                    onClick={() => handleUnmerge(cluster.clusterNumber)} title="병합 해제">
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
      <Dialog open={renameDialog.open} onOpenChange={(open) => setRenameDialog({ ...renameDialog, open })}>
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
            <Button variant="outline" onClick={() => setRenameDialog({ open: false, cluster: null })}>취소</Button>
            <Button onClick={handleRename}>변경</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 상세 보기 다이얼로그 */}
      <Dialog open={detailDialog.open} onOpenChange={(open) => setDetailDialog({ ...detailDialog, open })}>
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
                  <TableHead className="font-semibold text-xs text-right bg-gray-100">금액({amountUnit})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detailDialog.cluster?.children || []).map((sub) => (
                  <TableRow key={sub.clusterNumber} className="hover:bg-muted/50">
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px] font-mono">#{sub.clusterNumber}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{sub.clusterName}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-0.5">
                        {(sub.keywords || []).map((kw, i) => (
                          <Badge key={i} variant="secondary" className="text-[9px]">{kw}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-right">{(sub.count || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{formatAmount(sub.totalAmount || 0)}</TableCell>
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
