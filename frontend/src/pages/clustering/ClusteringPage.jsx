import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, Home, GitMerge, Eye, Edit2, Trash2, Plus,
  Loader2, Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdvancedTable from '@/components/AdvancedTable';
import clusteringService from '@/services/clusteringService';
import uploadService from '@/services/uploadService';

/* ============================================================
   페이징 컴포넌트
   ============================================================ */
function Pagination({ currentPage, totalPages, totalCount, pageSize, onPageChange, onPageSizeChange }) {
  if (totalCount === 0) return null;
  const s = currentPage * pageSize + 1;
  const e = Math.min((currentPage + 1) * pageSize, totalCount);
  return (
    <div className="p-3 border-t bg-white flex-shrink-0">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground hidden sm:block">{s}-{e} / 총 {totalCount.toLocaleString()}건</span>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <Select value={pageSize.toString()} onValueChange={v => onPageSizeChange(+v)}>
            <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[20, 50, 100, 500].map(n => <SelectItem key={n} value={n.toString()}>{n}개씩</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => onPageChange(0)} disabled={currentPage === 0}>처음</Button>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 0}>이전</Button>
            <span className="flex items-center px-2 text-xs font-medium">{currentPage + 1}/{totalPages || 1}</span>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages - 1}>다음</Button>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => onPageChange(totalPages - 1)} disabled={currentPage >= totalPages - 1}>마지막</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   정렬 아이콘
   ============================================================ */
const SortIcon = ({ field, cur, dir }) => {
  if (cur !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
  return dir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
};

/* ============================================================
   통계 리스트 (키워드/공급업체 공용) - div 기반 그리드
   ============================================================ */
function StatsListView({
  items, checkedSet, onCheckedChange, nameKey, nameLabel,
  sortField, sortDir, onSort, formatAmount, amountUnit,
  onDetail, isDragging, setIsDragging, dragStartRef,
}) {
  const handleMouseDown = (e, key, idx) => {
    if (e.button !== 0) return;
    // 체크박스 클릭은 별도 처리
    if (e.target.closest('[role="checkbox"]')) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      onCheckedChange(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
      return;
    }
    setIsDragging(true);
    dragStartRef.current = { idx, key };
    onCheckedChange(new Set([key]));
  };

  const handleMouseEnter = (key, idx) => {
    if (!isDragging || !dragStartRef.current) return;
    const sIdx = dragStartRef.current.idx;
    const lo = Math.min(sIdx, idx), hi = Math.max(sIdx, idx);
    const next = new Set();
    for (let i = lo; i <= hi; i++) next.add(items[i][nameKey]);
    onCheckedChange(next);
  };

  const toggleCheck = (key) => {
    onCheckedChange(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="select-none" onMouseUp={() => setIsDragging(false)}>
      {/* 헤더 */}
      <div className="grid grid-cols-[28px_1fr_70px_100px_auto] gap-1 items-center px-2 py-2 border-b bg-gray-100 text-xs font-semibold text-muted-foreground sticky top-0 z-10">
        <div></div>
        <div className="cursor-pointer flex items-center" onClick={() => onSort(nameKey)}>
          {nameLabel}<SortIcon field={nameKey} cur={sortField} dir={sortDir} />
        </div>
        <div className="text-right cursor-pointer flex items-center justify-end" onClick={() => onSort('count')}>
          Count<SortIcon field="count" cur={sortField} dir={sortDir} />
        </div>
        <div className="text-right cursor-pointer flex items-center justify-end" onClick={() => onSort('totalAmount')}>
          합계({amountUnit})<SortIcon field="totalAmount" cur={sortField} dir={sortDir} />
        </div>
        {onDetail && <div></div>}
      </div>
      {/* 행 */}
      {items.length === 0 ? (
        <div className="text-center text-xs text-muted-foreground py-8">통계가 없습니다</div>
      ) : items.map((item, idx) => {
        const key = item[nameKey];
        const checked = checkedSet.has(key);
        return (
          <div
            key={key}
            className={`grid grid-cols-[28px_1fr_70px_100px_auto] gap-1 items-center px-2 py-1.5 border-b cursor-pointer transition-colors
              ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            onMouseDown={e => handleMouseDown(e, key, idx)}
            onMouseEnter={() => handleMouseEnter(key, idx)}
          >
            <Checkbox checked={checked} onCheckedChange={() => toggleCheck(key)}
              onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} />
            <div className="truncate">
              <Badge variant="outline" className="text-[10px] font-medium max-w-[140px] truncate inline-block">
                {key}
              </Badge>
            </div>
            <div className="text-right text-xs tabular-nums">{(item.count || 0).toLocaleString()}</div>
            <div className="text-right text-xs tabular-nums">{formatAmount(item.totalAmount || 0)}</div>
            {onDetail && (
              <Button variant="ghost" size="sm"
                className="h-5 px-1.5 text-[10px] text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onDetail(key); }}>
                자세히
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   메인 ClusteringPage
   ============================================================ */
function ClusteringPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  /* ----- 상태 ----- */
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [statistics, setStatistics] = useState({ totalRows: 0, unmergedCount: 0, unmergedTotalAmount: 0, mergedGroupCount: 0, hasSupplier: false });
  const [amountUnit, setAmountUnit] = useState('원');
  const divisor = { '원': 1, '천원': 1000, '백만원': 1000000, '억원': 100000000 };

  /* 검색 */
  const [searchKeyword, setSearchKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState(null);

  /* 미병합 테이블 */
  const [clusterData, setClusterData] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [clusterPage, setClusterPage] = useState(0);
  const [clusterPageSize, setClusterPageSize] = useState(20);
  const [clusterTotalCount, setClusterTotalCount] = useState(0);
  const [clusterTotalPages, setClusterTotalPages] = useState(0);
  const [sort, setSort] = useState(null);

  /* 체크박스 (selectAllMode + exceptions) */
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [exceptions, setExceptions] = useState(new Set());
  /* 드래그 선택 */
  const [isDraggingRow, setIsDraggingRow] = useState(false);
  const dragRowStart = useRef(null);
  const dragRowAction = useRef(null); // 'check' or 'uncheck'

  /* 우측 탭 */
  const [activeTab, setActiveTab] = useState('keyword');

  /* 키워드 통계 */
  const [keywordStats, setKeywordStats] = useState([]);
  const [kwLoading, setKwLoading] = useState(false);
  const [kwCheckedSet, setKwCheckedSet] = useState(new Set());
  const [kwSortField, setKwSortField] = useState('count');
  const [kwSortDir, setKwSortDir] = useState('desc');
  const [kwDragging, setKwDragging] = useState(false);
  const kwDragRef = useRef(null);

  /* 공급업체 통계 */
  const [supplierStats, setSupplierStats] = useState([]);
  const [supLoading, setSupLoading] = useState(false);
  const [supCheckedSet, setSupCheckedSet] = useState(new Set());
  const [supSortField, setSupSortField] = useState('count');
  const [supSortDir, setSupSortDir] = useState('desc');
  const [supDragging, setSupDragging] = useState(false);
  const supDragRef = useRef(null);

  /* 병합 결과 */
  const [mergedClusters, setMergedClusters] = useState([]);
  const [selectedMerged, setSelectedMerged] = useState(new Set());

  /* 다이얼로그 */
  const [detailDialog, setDetailDialog] = useState({ open: false, cluster: null });
  const [detailChecked, setDetailChecked] = useState(new Set());
  const [renameDialog, setRenameDialog] = useState({ open: false, cluster: null });
  const [newClusterName, setNewClusterName] = useState('');
  const [addMergeDialog, setAddMergeDialog] = useState(false);

  /* ----- 글로벌 mouse up ----- */
  useEffect(() => {
    const handler = () => { setIsDraggingRow(false); setKwDragging(false); setSupDragging(false); };
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, []);

  /* ----- 금액 포맷 ----- */
  const formatAmount = useCallback((amount) => {
    if (amount == null || isNaN(amount)) return '0';
    const v = amount / divisor[amountUnit];
    if (amountUnit === '원') return Math.round(v).toLocaleString();
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }, [amountUnit]);

  /* ============================================================
     데이터 로드
     ============================================================ */
  const loadStatistics = useCallback(async () => {
    try { setStatistics(await clusteringService.getStatistics(projectId, sessionId)); } catch (e) { console.error(e); }
  }, [projectId, sessionId]);

  const loadUnmerged = useCallback(async (page, size, kw) => {
    setLoading(true);
    try {
      const r = await clusteringService.getUnmergedClusters(projectId, sessionId, page, size, kw);
      setClusterData(r.data || []);
      setVisibleColumns(r.columns || []);
      setClusterTotalCount(r.totalCount || 0);
      setClusterTotalPages(r.totalPages || 0);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [projectId, sessionId]);

  const loadKwStats = useCallback(async () => {
    setKwLoading(true);
    try { setKeywordStats(await clusteringService.getKeywordStats(projectId, sessionId) || []); } catch (e) { console.error(e); } finally { setKwLoading(false); }
  }, [projectId, sessionId]);

  const loadSupStats = useCallback(async () => {
    setSupLoading(true);
    try { setSupplierStats(await clusteringService.getSupplierStats(projectId, sessionId) || []); } catch (e) { console.error(e); } finally { setSupLoading(false); }
  }, [projectId, sessionId]);

  const loadMerged = useCallback(async () => {
    try { setMergedClusters(await clusteringService.getMergedClusters(projectId, sessionId) || []); } catch (e) { console.error(e); }
  }, [projectId, sessionId]);

  const loadAll = useCallback(() =>
    Promise.all([loadStatistics(), loadUnmerged(0, clusterPageSize, null), loadKwStats(), loadSupStats(), loadMerged()]),
    [loadStatistics, loadUnmerged, clusterPageSize, loadKwStats, loadSupStats, loadMerged]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStatistics(), loadUnmerged(clusterPage, clusterPageSize, appliedKeyword), loadKwStats(), loadSupStats(), loadMerged()]);
  }, [loadStatistics, loadUnmerged, clusterPage, clusterPageSize, appliedKeyword, loadKwStats, loadSupStats, loadMerged]);

  useEffect(() => { loadAll(); }, [projectId, sessionId]);

  /* ============================================================
     검색
     ============================================================ */
  const handleSearch = () => {
    const kw = searchKeyword.trim() || null;
    setAppliedKeyword(kw); setClusterPage(0);
    setSelectAllMode(false); setExceptions(new Set());
    loadUnmerged(0, clusterPageSize, kw);
  };
  const handleClearSearch = () => {
    setSearchKeyword(''); setAppliedKeyword(null); setClusterPage(0);
    setSelectAllMode(false); setExceptions(new Set());
    loadUnmerged(0, clusterPageSize, null);
  };

  /* 페이징 */
  const handlePageChange = (p) => { setClusterPage(p); loadUnmerged(p, clusterPageSize, appliedKeyword); };
  const handlePageSizeChange = (s) => { setClusterPageSize(s); setClusterPage(0); loadUnmerged(0, s, appliedKeyword); };

  /* ============================================================
     체크박스 (selectAllMode + exceptions)
     ============================================================ */
  const isRowChecked = useCallback((cn) => selectAllMode ? !exceptions.has(cn) : exceptions.has(cn), [selectAllMode, exceptions]);

  const handleHeaderCheck = (checked) => {
    setSelectAllMode(!!checked);
    setExceptions(new Set());
  };

  const handleRowCheck = useCallback((cn, checked) => {
    setExceptions(prev => {
      const next = new Set(prev);
      if (selectAllMode) { checked ? next.delete(cn) : next.add(cn); }
      else { checked ? next.add(cn) : next.delete(cn); }
      return next;
    });
  }, [selectAllMode]);

  const selectedCount = useMemo(() => selectAllMode ? clusterTotalCount - exceptions.size : exceptions.size, [selectAllMode, exceptions, clusterTotalCount]);
  const isHeaderChecked = useMemo(() => clusterTotalCount > 0 && selectAllMode && exceptions.size === 0, [selectAllMode, exceptions, clusterTotalCount]);
  const isHeaderIndeterminate = useMemo(() => {
    if (selectAllMode && exceptions.size > 0 && exceptions.size < clusterTotalCount) return true;
    if (!selectAllMode && exceptions.size > 0 && exceptions.size < clusterTotalCount) return true;
    return false;
  }, [selectAllMode, exceptions, clusterTotalCount]);

  const getSelectedClusterNumbers = useCallback(async () => {
    if (selectAllMode) {
      const all = await clusteringService.getAllUnmergedClusterNumbers(projectId, sessionId, appliedKeyword);
      return all.filter(id => !exceptions.has(id));
    }
    return Array.from(exceptions);
  }, [selectAllMode, exceptions, projectId, sessionId, appliedKeyword]);

  /* ============================================================
     드래그 선택 (미병합 테이블)
     ============================================================ */
  const handleTableRowMouseDown = useCallback((row, idx, e) => {
    if (e.button !== 0) return;
    if (e.target.closest('[role="checkbox"]')) return;
    e.preventDefault();
    const cn = row.clusterNumber;
    if (e.ctrlKey || e.metaKey) {
      handleRowCheck(cn, !isRowChecked(cn));
      return;
    }
    setIsDraggingRow(true);
    const currentlyChecked = isRowChecked(cn);
    dragRowAction.current = currentlyChecked ? 'uncheck' : 'check';
    dragRowStart.current = idx;
    handleRowCheck(cn, !currentlyChecked);
  }, [isRowChecked, handleRowCheck]);

  const handleTableRowMouseEnter = useCallback((row, idx, e) => {
    if (!isDraggingRow || dragRowStart.current === null) return;
    const lo = Math.min(dragRowStart.current, idx);
    const hi = Math.max(dragRowStart.current, idx);
    const action = dragRowAction.current;
    setExceptions(prev => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) {
        const cn = clusterData[i]?.clusterNumber;
        if (cn == null) continue;
        if (selectAllMode) {
          action === 'check' ? next.delete(cn) : next.add(cn);
        } else {
          action === 'check' ? next.add(cn) : next.delete(cn);
        }
      }
      return next;
    });
  }, [isDraggingRow, selectAllMode, clusterData]);

  /* ============================================================
     병합 / 추가 병합
     ============================================================ */
  const handleMerge = async () => {
    if (selectedCount < 2) { alert('2개 이상의 클러스터를 선택하세요.'); return; }
    if (!window.confirm(`선택한 ${selectedCount}개 클러스터를 병합하시겠습니까?`)) return;
    setMerging(true);
    try {
      const nums = await getSelectedClusterNumbers();
      await clusteringService.mergeClusters(projectId, sessionId, nums);
      setSelectAllMode(false); setExceptions(new Set());
      await refreshAll();
    } catch (e) { alert('병합 실패: ' + (e.response?.data?.message || e.message)); } finally { setMerging(false); }
  };

  const handleAddToMerged = async (targetMergedNumber) => {
    if (selectedCount === 0) return;
    setMerging(true);
    try {
      const nums = await getSelectedClusterNumbers();
      await clusteringService.addToMergedCluster(projectId, sessionId, targetMergedNumber, nums);
      setSelectAllMode(false); setExceptions(new Set());
      setAddMergeDialog(false);
      await refreshAll();
    } catch (e) { alert('추가 병합 실패: ' + (e.response?.data?.message || e.message)); } finally { setMerging(false); }
  };

  /* ============================================================
     키워드 통계 → 자세히 / 자동 클러스터링
     ============================================================ */
  const handleKwDetail = (keyword) => {
    setSearchKeyword(keyword); setAppliedKeyword(keyword); setClusterPage(0);
    setSelectAllMode(false); setExceptions(new Set());
    loadUnmerged(0, clusterPageSize, keyword);
  };

  const handleAutoMergeByKeywords = async () => {
    if (kwCheckedSet.size === 0) { alert('키워드를 선택해주세요.'); return; }
    if (!window.confirm(`선택한 ${kwCheckedSet.size}개 키워드의 클러스터를 자동 병합합니다.`)) return;
    setMerging(true);
    try {
      for (const keyword of kwCheckedSet) {
        const ids = await clusteringService.getAllUnmergedClusterNumbers(projectId, sessionId, keyword);
        if (ids.length >= 2) await clusteringService.mergeClusters(projectId, sessionId, ids);
      }
      setKwCheckedSet(new Set()); setSelectAllMode(false); setExceptions(new Set());
      await refreshAll();
    } catch (e) { alert('자동 클러스터링 실패: ' + (e.response?.data?.message || e.message)); } finally { setMerging(false); }
  };

  const handleAutoMergeBySuppliers = async () => {
    if (supCheckedSet.size === 0) { alert('공급업체를 선택해주세요.'); return; }
    alert('공급업체 기준 자동 클러스터링은 추후 확장됩니다.');
  };

  /* ============================================================
     통계 정렬
     ============================================================ */
  const handleKwSort = (f) => { if (kwSortField === f) setKwSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setKwSortField(f); setKwSortDir('desc'); } };
  const handleSupSort = (f) => { if (supSortField === f) setSupSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSupSortField(f); setSupSortDir('desc'); } };

  const sortedKwStats = useMemo(() => {
    const s = [...keywordStats];
    s.sort((a, b) => { const av = a[kwSortField], bv = b[kwSortField]; if (typeof av === 'string') return kwSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); return kwSortDir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0); });
    return s;
  }, [keywordStats, kwSortField, kwSortDir]);

  const sortedSupStats = useMemo(() => {
    const s = [...supplierStats];
    s.sort((a, b) => { const av = a[supSortField], bv = b[supSortField]; if (typeof av === 'string') return supSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); return supSortDir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0); });
    return s;
  }, [supplierStats, supSortField, supSortDir]);

  /* ============================================================
     병합 결과: 전체해제 / merge-merged / 개별해제
     ============================================================ */
  const handleUnmerge = async (cn) => {
    if (!window.confirm(`클러스터 #${cn}의 병합을 해제하시겠습니까?`)) return;
    try { await clusteringService.unmergeClusters(projectId, sessionId, cn); setSelectedMerged(new Set()); await refreshAll(); }
    catch (e) { alert('병합 해제 실패: ' + (e.response?.data?.message || e.message)); }
  };

  const handleBulkUnmerge = async () => {
    if (selectedMerged.size === 0) return;
    if (!window.confirm(`${selectedMerged.size}개 병합 클러스터를 해제하시겠습니까?`)) return;
    try { for (const cn of selectedMerged) await clusteringService.unmergeClusters(projectId, sessionId, cn); setSelectedMerged(new Set()); await refreshAll(); }
    catch (e) { alert('병합 해제 실패: ' + (e.response?.data?.message || e.message)); }
  };

  const handleMergeMerged = async () => {
    if (selectedMerged.size < 2) { alert('2개 이상의 병합 클러스터를 선택하세요.'); return; }
    if (!window.confirm(`${selectedMerged.size}개 병합 클러스터를 하나로 합치시겠습니까?`)) return;
    setMerging(true);
    try {
      await clusteringService.mergeMergedClusters(projectId, sessionId, Array.from(selectedMerged));
      setSelectedMerged(new Set()); await refreshAll();
    } catch (e) { alert('병합 실패: ' + (e.response?.data?.message || e.message)); } finally { setMerging(false); }
  };

  /* ============================================================
     병합 상세 다이얼로그 - 부분 해제
     ============================================================ */
  const handleOpenDetail = (cluster) => { setDetailDialog({ open: true, cluster }); setDetailChecked(new Set()); };

  const handlePartialUnmerge = async () => {
    if (detailChecked.size === 0) { alert('해제할 항목을 선택하세요.'); return; }
    if (!window.confirm(`선택한 ${detailChecked.size}개 클러스터를 병합 해제하시겠습니까?`)) return;
    try {
      await clusteringService.unmergePartialClusters(projectId, sessionId, detailDialog.cluster.clusterNumber, Array.from(detailChecked));
      setDetailDialog({ open: false, cluster: null }); setDetailChecked(new Set());
      await refreshAll();
    } catch (e) { alert('부분 해제 실패: ' + (e.response?.data?.message || e.message)); }
  };

  /* 이름 변경 */
  const handleOpenRename = (c) => { setRenameDialog({ open: true, cluster: c }); setNewClusterName(c.clusterName); };
  const handleRename = async () => {
    if (!newClusterName.trim()) return;
    try {
      await clusteringService.renameCluster(projectId, sessionId, renameDialog.cluster.clusterNumber, newClusterName);
      setRenameDialog({ open: false, cluster: null }); await refreshAll();
    } catch (e) { alert('이름 변경 실패: ' + (e.response?.data?.message || e.message)); }
  };

  /* 완료 */
  const handleComplete = async () => {
    try { await uploadService.updateStepHistory(projectId, sessionId, 6); } catch (e) { console.error(e); }
    navigate(`/projects/${projectId}/sessions/${sessionId}/export`);
  };

  /* ============================================================
     AdvancedTable 컬럼 (고정 + 동적)
     ============================================================ */
  const clusterColumns = useMemo(() => {
    const cols = [
      {
        key: '_cb', label: '', pinned: true, sortable: false, resizable: false, width: 50,
        headerRender: () => (
          <Checkbox checked={isHeaderChecked}
            ref={el => { if (el) el.indeterminate = isHeaderIndeterminate; }}
            onCheckedChange={handleHeaderCheck} />
        ),
        render: (row) => (
          <Checkbox checked={isRowChecked(row.clusterNumber)}
            onCheckedChange={c => handleRowCheck(row.clusterNumber, c)} />
        ),
      },
      {
        key: 'clusterNumber', label: '클러스터번호', pinned: true, sortable: true, width: 110,
        render: r => <Badge variant="outline" className="text-[10px] font-mono">#{r.clusterNumber}</Badge>,
      },
      { key: 'clusterName', label: '클러스터명', sortable: true, minWidth: 150,
        render: r => <span className="whitespace-nowrap">{r.clusterName}</span>,
      },
      {
        key: 'keywords', label: '키워드', sortable: false, minWidth: 200,
        render: r => <div className="flex flex-wrap gap-1">{(r.keywords || []).map((k, i) => <Badge key={i} variant="secondary" className="text-[10px]">{k}</Badge>)}</div>,
      },
      {
        key: 'count', label: 'Count', sortable: true, width: 90, cellClassName: 'text-right', headerClassName: 'text-right',
        render: r => <span className="block text-right">{(r.count || 0).toLocaleString()}</span>,
      },
      {
        key: 'totalAmount', label: `금액(${amountUnit})`, sortable: true, width: 130, cellClassName: 'text-right', headerClassName: 'text-right',
        render: r => <span className="block text-right">{formatAmount(r.totalAmount || 0)}</span>,
      },
    ];
    if (visibleColumns?.length) {
      for (const colName of visibleColumns) {
        cols.push({
          key: `rep_${colName}`, label: colName, sortable: false, minWidth: 100,
          render: r => { const v = r.representativeData?.[colName]; return <span className="whitespace-nowrap text-xs">{v != null ? String(v) : ''}</span>; },
        });
      }
    }
    return cols;
  }, [isHeaderChecked, isHeaderIndeterminate, selectAllMode, exceptions, visibleColumns, amountUnit, formatAmount]);

  /* 상세 다이얼로그 컬럼 (체크박스 + 동적) */
  const detailColumns = useMemo(() => {
    const cols = [
      {
        key: '_cb', label: '', pinned: true, sortable: false, resizable: false, width: 40,
        headerRender: () => {
          const all = detailDialog.cluster?.children?.length || 0;
          const checked = detailChecked.size === all && all > 0;
          return <Checkbox checked={checked} onCheckedChange={c => {
            if (c) setDetailChecked(new Set((detailDialog.cluster?.children || []).map(ch => ch.clusterNumber)));
            else setDetailChecked(new Set());
          }} />;
        },
        render: r => <Checkbox checked={detailChecked.has(r.clusterNumber)}
          onCheckedChange={c => setDetailChecked(prev => { const n = new Set(prev); c ? n.add(r.clusterNumber) : n.delete(r.clusterNumber); return n; })} />,
      },
      { key: 'clusterNumber', label: '#', pinned: true, sortable: false, width: 70,
        render: r => <Badge variant="outline" className="text-[10px] font-mono">#{r.clusterNumber}</Badge> },
      { key: 'clusterName', label: '클러스터명', sortable: false, minWidth: 120 },
      { key: 'keywords', label: '키워드', sortable: false, minWidth: 160,
        render: r => <div className="flex flex-wrap gap-0.5">{(r.keywords||[]).map((k,i)=><Badge key={i} variant="secondary" className="text-[9px]">{k}</Badge>)}</div> },
      { key: 'count', label: 'Count', sortable: false, width: 70, cellClassName: 'text-right', render: r => <span className="block text-right text-xs">{(r.count||0).toLocaleString()}</span> },
      { key: 'totalAmount', label: `금액(${amountUnit})`, sortable: false, width: 100, cellClassName: 'text-right', render: r => <span className="block text-right text-xs">{formatAmount(r.totalAmount||0)}</span> },
    ];
    const visCols = detailDialog.cluster?.columns || [];
    for (const colName of visCols) {
      cols.push({
        key: `rep_${colName}`, label: colName, sortable: false, minWidth: 80,
        render: r => { const v = r.representativeData?.[colName]; return <span className="text-xs">{v != null ? String(v) : ''}</span>; },
      });
    }
    return cols;
  }, [detailDialog.cluster, detailChecked, amountUnit, formatAmount]);

  /* ============================================================
     렌더
     ============================================================ */
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">

        {/* 헤더 */}
        <div className="flex-shrink-0 space-y-4 mb-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/projects"><Home className="h-4 w-4" /></BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
              <BreadcrumbItem><BreadcrumbLink href={`/projects/${projectId}/upload`}>프로젝트</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
              <BreadcrumbItem><BreadcrumbPage className="font-semibold">Step 5: Clustering</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* 통계 카드 */}
          <Card className="shadow-sm">
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-4 text-sm flex-wrap">
                <div className="flex items-center gap-6 flex-wrap">
                  <span><span className="font-semibold">전체 행수:</span> <Badge variant="secondary">{(statistics.totalRows||0).toLocaleString()}</Badge></span>
                  <span><span className="font-semibold">미병합 클러스터:</span> <Badge variant="secondary">{(statistics.unmergedCount||0).toLocaleString()}</Badge></span>
                  <span><span className="font-semibold">미병합 합산:</span> <Badge variant="secondary">{formatAmount(statistics.unmergedTotalAmount||0)}</Badge></span>
                  <span><span className="font-semibold">병합 그룹:</span> <Badge variant="secondary">{(statistics.mergedGroupCount||0).toLocaleString()}</Badge></span>
                </div>
                <Select value={amountUnit} onValueChange={setAmountUnit}>
                  <SelectTrigger className="w-[80px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['원','천원','백만원','억원'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 메인 그리드 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* === 좌측 (8/12): 미병합 클러스터 === */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-3">

            {/* 미병합 카드 헤더: 병합 + 추가병합 + 검색 */}
            <Card className="flex-shrink-0 shadow-sm">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" className="h-8" onClick={handleMerge} disabled={selectedCount < 2 || merging}>
                    {merging && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    <GitMerge className="h-3 w-3 mr-1" />병합 ({selectedCount})
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setAddMergeDialog(true)} disabled={selectedCount === 0 || mergedClusters.length === 0}>
                    <Plus className="h-3 w-3 mr-1" />추가 병합
                  </Button>

                  <div className="flex-1" />

                  <Input className="h-8 text-sm w-[200px]" placeholder="키워드 검색..."
                    value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                  <Button size="sm" className="h-8" onClick={handleSearch}><Search className="h-3 w-3 mr-1" />검색</Button>
                  {appliedKeyword && <Button size="sm" variant="outline" className="h-8" onClick={handleClearSearch}>초기화</Button>}
                </div>
                {appliedKeyword && (
                  <div className="mt-2">
                    <Badge variant="secondary" className="text-[10px]">검색: {appliedKeyword}</Badge>
                    <span className="text-xs text-muted-foreground ml-2">{clusterTotalCount.toLocaleString()}건</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 미병합 테이블 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-2.5 px-4 border-b bg-white flex-shrink-0">
                <CardTitle className="text-sm font-bold">미병합 클러스터 ({clusterTotalCount.toLocaleString()}건)</CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                <AdvancedTable
                  columns={clusterColumns}
                  data={clusterData}
                  rowKey={r => r.clusterNumber}
                  sort={sort}
                  onSortChange={(f, d) => setSort({ field: f, direction: d })}
                  loading={loading}
                  emptyMessage="클러스터 데이터가 없습니다."
                  onRowMouseDown={handleTableRowMouseDown}
                  onRowMouseEnter={handleTableRowMouseEnter}
                  rowClassName={(r) => isRowChecked(r.clusterNumber) ? 'bg-blue-50' : ''}
                />
              </CardContent>
              <Pagination currentPage={clusterPage} totalPages={clusterTotalPages} totalCount={clusterTotalCount}
                pageSize={clusterPageSize} onPageChange={handlePageChange} onPageSizeChange={handlePageSizeChange} />
            </Card>
          </div>

          {/* === 우측 (4/12) === */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">

            {/* 키워드/공급업체 통계 (60% 이하) */}
            <div className="flex-shrink-0" style={{ maxHeight: '55%', minHeight: '30%' }}>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <TabsList className={`grid w-full ${statistics.hasSupplier ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <TabsTrigger value="keyword">키워드별</TabsTrigger>
                  {statistics.hasSupplier && <TabsTrigger value="supplier">공급업체별</TabsTrigger>}
                </TabsList>

                <TabsContent value="keyword" className="mt-2 flex-1 min-h-0 flex flex-col">
                  <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <CardHeader className="py-2 px-3 border-b flex-shrink-0">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold">키워드 통계 ({keywordStats.length}건)</CardTitle>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={loadKwStats} disabled={kwLoading}>
                          <RefreshCw className={`h-3 w-3 ${kwLoading ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0 flex-1 overflow-auto">
                      <StatsListView items={sortedKwStats} checkedSet={kwCheckedSet} onCheckedChange={setKwCheckedSet}
                        nameKey="keyword" nameLabel="키워드" sortField={kwSortField} sortDir={kwSortDir} onSort={handleKwSort}
                        formatAmount={formatAmount} amountUnit={amountUnit} onDetail={handleKwDetail}
                        isDragging={kwDragging} setIsDragging={setKwDragging} dragStartRef={kwDragRef} />
                    </CardContent>
                  </Card>
                  <Button className="w-full mt-2 bg-purple-600 hover:bg-purple-700 h-8 text-sm font-semibold flex-shrink-0"
                    onClick={handleAutoMergeByKeywords} disabled={kwCheckedSet.size === 0 || merging}>
                    {merging && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    <GitMerge className="h-3 w-3 mr-1" />선택항목 자동 클러스터링 ({kwCheckedSet.size})
                  </Button>
                </TabsContent>

                {statistics.hasSupplier && (
                  <TabsContent value="supplier" className="mt-2 flex-1 min-h-0 flex flex-col">
                    <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      <CardHeader className="py-2 px-3 border-b flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-bold">공급업체 통계 ({supplierStats.length}건)</CardTitle>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={loadSupStats} disabled={supLoading}>
                            <RefreshCw className={`h-3 w-3 ${supLoading ? 'animate-spin' : ''}`} />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0 flex-1 overflow-auto">
                        <StatsListView items={sortedSupStats} checkedSet={supCheckedSet} onCheckedChange={setSupCheckedSet}
                          nameKey="supplier" nameLabel="공급업체" sortField={supSortField} sortDir={supSortDir} onSort={handleSupSort}
                          formatAmount={formatAmount} amountUnit={amountUnit}
                          isDragging={supDragging} setIsDragging={setSupDragging} dragStartRef={supDragRef} />
                      </CardContent>
                    </Card>
                    <Button className="w-full mt-2 bg-purple-600 hover:bg-purple-700 h-8 text-sm font-semibold flex-shrink-0"
                      onClick={handleAutoMergeBySuppliers} disabled={supCheckedSet.size === 0 || merging}>
                      {merging && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      <GitMerge className="h-3 w-3 mr-1" />선택항목 자동 클러스터링 ({supCheckedSet.size})
                    </Button>
                  </TabsContent>
                )}
              </Tabs>
            </div>

            {/* 병합결과 확인 (40%+) */}
            <div className="flex-1 min-h-[40%] mt-3 flex flex-col">
              <Card className="flex-1 flex flex-col min-h-0 overflow-hidden shadow-sm">
                <CardHeader className="py-2 px-3 border-b flex-shrink-0">
                  <div className="flex items-center justify-between gap-1">
                    <CardTitle className="text-sm font-bold">병합 결과 ({mergedClusters.length})</CardTitle>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                        onClick={handleMergeMerged} disabled={selectedMerged.size < 2 || merging}>
                        <GitMerge className="h-3 w-3 mr-1" />병합 merge ({selectedMerged.size})
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600"
                        onClick={handleBulkUnmerge} disabled={selectedMerged.size === 0}>
                        <Trash2 className="h-3 w-3 mr-1" />해제 ({selectedMerged.size})
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-auto">
                  {mergedClusters.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">병합된 클러스터가 없습니다</div>
                  ) : (
                    <div className="text-xs">
                      {/* 헤더 */}
                      <div className="grid grid-cols-[28px_1fr_60px_90px_60px] gap-1 items-center px-2 py-2 border-b bg-gray-100 font-semibold text-muted-foreground sticky top-0 z-10">
                        <Checkbox checked={selectedMerged.size === mergedClusters.length && mergedClusters.length > 0}
                          onCheckedChange={c => {
                            if (c) setSelectedMerged(new Set(mergedClusters.map(m => m.clusterNumber)));
                            else setSelectedMerged(new Set());
                          }} />
                        <div>클러스터명</div>
                        <div className="text-right">Count</div>
                        <div className="text-right">금액({amountUnit})</div>
                        <div className="text-center">관리</div>
                      </div>
                      {mergedClusters.map(c => (
                        <div key={c.clusterNumber}
                          className={`grid grid-cols-[28px_1fr_60px_90px_60px] gap-1 items-center px-2 py-1.5 border-b hover:bg-muted/50
                            ${selectedMerged.has(c.clusterNumber) ? 'bg-blue-50' : ''}`}>
                          <Checkbox checked={selectedMerged.has(c.clusterNumber)}
                            onCheckedChange={ch => setSelectedMerged(prev => { const n = new Set(prev); ch ? n.add(c.clusterNumber) : n.delete(c.clusterNumber); return n; })} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[9px] font-mono flex-shrink-0">#{c.clusterNumber}</Badge>
                              <span className="truncate">{c.clusterName}</span>
                            </div>
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {(c.keywords || []).slice(0, 4).map((k, i) => <Badge key={i} variant="secondary" className="text-[8px]">{k}</Badge>)}
                              {(c.keywords || []).length > 4 && <Badge variant="secondary" className="text-[8px]">+{c.keywords.length - 4}</Badge>}
                            </div>
                          </div>
                          <div className="text-right tabular-nums">{(c.count||0).toLocaleString()}</div>
                          <div className="text-right tabular-nums">{formatAmount(c.totalAmount||0)}</div>
                          <div className="flex items-center justify-center gap-0.5">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleOpenDetail(c)} title="상세"><Eye className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleOpenRename(c)} title="이름변경"><Edit2 className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => handleUnmerge(c.clusterNumber)} title="병합해제"><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 완료 버튼 */}
              <Button className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold flex-shrink-0"
                onClick={handleComplete}>
                완료 → Step 6: Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 추가 병합 다이얼로그 ===== */}
      <Dialog open={addMergeDialog} onOpenChange={setAddMergeDialog}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>추가 병합 - 대상 병합 클러스터 선택</DialogTitle>
            <DialogDescription>선택한 {selectedCount}개 미병합 클러스터를 추가할 병합 클러스터를 선택하세요.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto space-y-1">
            {mergedClusters.map(c => (
              <div key={c.clusterNumber}
                className="flex items-center justify-between p-2 border rounded hover:bg-blue-50 cursor-pointer"
                onClick={() => handleAddToMerged(c.clusterNumber)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-sm">
                    <Badge variant="outline" className="text-[10px] font-mono">#{c.clusterNumber}</Badge>
                    <span className="truncate font-medium">{c.clusterName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {c.childCount}개 하위 | Count: {(c.count||0).toLocaleString()} | {formatAmount(c.totalAmount||0)}
                  </div>
                </div>
                <Plus className="h-4 w-4 text-blue-600 flex-shrink-0 ml-2" />
              </div>
            ))}
            {mergedClusters.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-8">병합 클러스터가 없습니다</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 이름 변경 다이얼로그 ===== */}
      <Dialog open={renameDialog.open} onOpenChange={o => setRenameDialog({ ...renameDialog, open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>클러스터 이름 변경</DialogTitle>
            <DialogDescription>클러스터 #{renameDialog.cluster?.clusterNumber}의 새 이름을 입력하세요.</DialogDescription>
          </DialogHeader>
          <Input placeholder="클러스터 이름" value={newClusterName} onChange={e => setNewClusterName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename()} />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setRenameDialog({ open: false, cluster: null })}>취소</Button>
            <Button onClick={handleRename}>변경</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 상세 다이얼로그 (동적 컬럼 + 체크박스 + 부분 해제) ===== */}
      <Dialog open={detailDialog.open} onOpenChange={o => setDetailDialog({ ...detailDialog, open: o })}>
        <DialogContent className="max-w-[900px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              병합 상세: #{detailDialog.cluster?.clusterNumber} {detailDialog.cluster?.clusterName}
            </DialogTitle>
            <DialogDescription>
              하위 클러스터 {detailDialog.cluster?.childCount || 0}개
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Button size="sm" variant="destructive" onClick={handlePartialUnmerge} disabled={detailChecked.size === 0}>
              <Trash2 className="h-3 w-3 mr-1" />선택 항목 병합 해제 ({detailChecked.size})
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <AdvancedTable
              columns={detailColumns}
              data={detailDialog.cluster?.children || []}
              rowKey={r => r.clusterNumber}
              emptyMessage="하위 클러스터가 없습니다."
              rowClassName={r => detailChecked.has(r.clusterNumber) ? 'bg-blue-50' : ''}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClusteringPage;
