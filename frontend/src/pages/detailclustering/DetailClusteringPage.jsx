import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Home, GitMerge, Eye, Edit2, Trash2, Plus,
  Loader2, Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown,
  X, Folder, FolderOpen, Tag,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdvancedTable from '@/components/AdvancedTable';
import detailClusteringService from '@/services/detailClusteringService';


const truncateName = (name, maxLen = 30) => {
  if (!name) return '';
  return name.length > maxLen ? name.slice(0, maxLen) + '...' : name;
};

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

const SortIcon = ({ field, cur, dir }) => {
  if (cur !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
  return dir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
};

function StatsListView({
  items, checkedSet, onCheckedChange, nameKey, nameLabel,
  sortField, sortDir, onSort, formatAmount, amountUnit,
  onDetail, isDragging, setIsDragging, dragStartRef,
}) {
  const handleMouseDown = (e, key, idx) => {
    if (e.button !== 0) return;
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
      <div className="grid grid-cols-[28px_1fr_70px_100px_auto] gap-1 items-center px-2 py-2 border-b bg-gray-100 text-xs font-semibold text-muted-foreground sticky top-0 z-10">
        <div></div>
        <div className="cursor-pointer flex items-center" onClick={() => onSort(nameKey)}>{nameLabel}<SortIcon field={nameKey} cur={sortField} dir={sortDir} /></div>
        <div className="text-right cursor-pointer flex items-center justify-end" onClick={() => onSort('count')}>Count<SortIcon field="count" cur={sortField} dir={sortDir} /></div>
        <div className="text-right cursor-pointer flex items-center justify-end" onClick={() => onSort('totalAmount')}>합계({amountUnit})<SortIcon field="totalAmount" cur={sortField} dir={sortDir} /></div>
        {onDetail && <div></div>}
      </div>
      {items.length === 0 ? (
        <div className="text-center text-xs text-muted-foreground py-8">통계가 없습니다</div>
      ) : items.map((item, idx) => {
        const key = item[nameKey];
        const checked = checkedSet.has(key);
        return (
          <div key={key} className={`grid grid-cols-[28px_1fr_70px_100px_auto] gap-1 items-center px-2 py-1.5 border-b cursor-pointer transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            onMouseDown={e => handleMouseDown(e, key, idx)} onMouseEnter={() => handleMouseEnter(key, idx)}>
            <Checkbox checked={checked} onCheckedChange={() => toggleCheck(key)} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} />
            <div className="truncate"><Badge variant="outline" className="text-[10px] font-medium max-w-[140px] truncate inline-block">{key}</Badge></div>
            <div className="text-right text-xs tabular-nums">{(item.count || 0).toLocaleString()}</div>
            <div className="text-right text-xs tabular-nums">{formatAmount(item.totalAmount || 0)}</div>
            {onDetail && (
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDetail(key); }}>자세히</Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   메인 DetailClusteringPage
   ============================================================ */
function DetailClusteringPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clusterId = parseInt(searchParams.get('clusterId'), 10);

  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergingProgress, setMergingProgress] = useState(0);
  const [mergingClusters, setMergingClusters] = useState(new Set());
  const [unmerging, setUnmerging] = useState(false);
  const [unmergingProgress, setUnmergingProgress] = useState(0);
  const [unmergingClusters, setUnmergingClusters] = useState(new Set());
  const [statistics, setStatistics] = useState({ totalRows: 0, unmergedCount: 0, unmergedTotalAmount: 0, mergedGroupCount: 0, hasSupplier: false });
  const [amountUnit, setAmountUnit] = useState('원');
  const divisor = { '원': 1, '천원': 1000, '백만원': 1000000, '억원': 100000000 };

  const [searchableColumns, setSearchableColumns] = useState([]);
  const [searchColumn, setSearchColumn] = useState('keyword');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [exactMatch, setExactMatch] = useState(false);
  const [excludeKeyword, setExcludeKeyword] = useState('');
  const [excludeExactMatch, setExcludeExactMatch] = useState(false);
  const [searchWithinResults, setSearchWithinResults] = useState(false);
  const [previousResultIds, setPreviousResultIds] = useState(null);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const [appliedSearchParams, setAppliedSearchParams] = useState(null);
  const [searchTabMode, setSearchTabMode] = useState('basic');

  const [keywordHierarchy, setKeywordHierarchy] = useState([]);
  const [kwHierarchyLoading, setKwHierarchyLoading] = useState(false);
  const [expandedLv1, setExpandedLv1] = useState(new Set());
  const [expandedLv2, setExpandedLv2] = useState(new Set());
  const [newKeywordInput, setNewKeywordInput] = useState({ level: 0, parentId: null, value: '' });
  const [keywordHierarchyDialog, setKeywordHierarchyDialog] = useState({ open: false, parentId: null, parentKeyword: '', level: 2 });

  const [clusterData, setClusterData] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [clusterPage, setClusterPage] = useState(0);
  const [clusterPageSize, setClusterPageSize] = useState(20);
  const [clusterTotalCount, setClusterTotalCount] = useState(0);
  const [clusterTotalPages, setClusterTotalPages] = useState(0);
  const [sort, setSort] = useState(null);

  const [selectAllMode, setSelectAllMode] = useState(false);
  const [exceptions, setExceptions] = useState(new Set());
  const [isDraggingRow, setIsDraggingRow] = useState(false);
  const dragRowStart = useRef(null);
  const dragRowAction = useRef(null);

  const [activeTab, setActiveTab] = useState('keyword');
  const [keywordStats, setKeywordStats] = useState([]);
  const [kwLoading, setKwLoading] = useState(false);
  const [kwCheckedSet, setKwCheckedSet] = useState(new Set());
  const [kwSortField, setKwSortField] = useState('count');
  const [kwSortDir, setKwSortDir] = useState('desc');
  const [kwDragging, setKwDragging] = useState(false);
  const kwDragRef = useRef(null);

  const [supplierStats, setSupplierStats] = useState([]);
  const [supLoading, setSupLoading] = useState(false);
  const [supCheckedSet, setSupCheckedSet] = useState(new Set());
  const [supSortField, setSupSortField] = useState('count');
  const [supSortDir, setSupSortDir] = useState('desc');
  const [supDragging, setSupDragging] = useState(false);
  const supDragRef = useRef(null);

  const [mergedClusters, setMergedClusters] = useState([]);
  const [selectedMerged, setSelectedMerged] = useState(new Set());

  const [detailDialog, setDetailDialog] = useState({ open: false, cluster: null });
  const [detailChecked, setDetailChecked] = useState(new Set());
  const [detailDragging, setDetailDragging] = useState(false);
  const detailDragStart = useRef(null);
  const detailDragAction = useRef(null);
  const [renameDialog, setRenameDialog] = useState({ open: false, cluster: null });
  const [newClusterName, setNewClusterName] = useState('');
  const [addMergeDialog, setAddMergeDialog] = useState(false);

  useEffect(() => {
    const handler = () => { setIsDraggingRow(false); setKwDragging(false); setSupDragging(false); setDetailDragging(false); };
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, []);

  const formatAmount = useCallback((amount) => {
    if (amount == null || isNaN(amount)) return '0';
    const v = amount / divisor[amountUnit];
    if (amountUnit === '원') return Math.round(v).toLocaleString();
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }, [amountUnit]);

  /* === 데이터 로드 (clusterId 스코핑) === */
  const loadStatistics = useCallback(async () => {
    try { setStatistics(await detailClusteringService.getStatistics(projectId, sessionId, clusterId)); } catch (e) { console.error(e); }
  }, [projectId, sessionId, clusterId]);

  const loadUnmerged = useCallback(async (page, size, kw) => {
    setLoading(true);
    try {
      const r = await detailClusteringService.getUnmergedClusters(projectId, sessionId, clusterId, page, size, kw);
      setClusterData(r.data || []); setVisibleColumns(r.columns || []);
      setClusterTotalCount(r.totalCount || 0); setClusterTotalPages(r.totalPages || 0);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [projectId, sessionId, clusterId]);

  const loadKwStats = useCallback(async () => {
    setKwLoading(true);
    try { setKeywordStats(await detailClusteringService.getKeywordStats(projectId, sessionId, clusterId) || []); } catch (e) { console.error(e); } finally { setKwLoading(false); }
  }, [projectId, sessionId, clusterId]);

  const loadSupStats = useCallback(async () => {
    setSupLoading(true);
    try { setSupplierStats(await detailClusteringService.getSupplierStats(projectId, sessionId, clusterId) || []); } catch (e) { console.error(e); } finally { setSupLoading(false); }
  }, [projectId, sessionId, clusterId]);

  const loadMerged = useCallback(async () => {
    try { setMergedClusters(await detailClusteringService.getMergedClusters(projectId, sessionId, clusterId) || []); } catch (e) { console.error(e); }
  }, [projectId, sessionId, clusterId]);

  const loadSearchableColumns = useCallback(async () => {
    try { setSearchableColumns(await detailClusteringService.getSearchableColumns(projectId, sessionId, clusterId) || []); } catch (e) { console.error(e); }
  }, [projectId, sessionId, clusterId]);

  const loadKeywordHierarchy = useCallback(async () => {
    setKwHierarchyLoading(true);
    try { setKeywordHierarchy(await detailClusteringService.getKeywordHierarchy(projectId, sessionId) || []); } catch (e) { console.error(e); } finally { setKwHierarchyLoading(false); }
  }, [projectId, sessionId]);

  const loadAll = useCallback(async () => {
    // Phase 1: 핵심 데이터 (통계 + 미병합 목록)
    await Promise.all([loadStatistics(), loadUnmerged(0, clusterPageSize, null)]);
    // Phase 2: 보조 데이터 (DB 동시 쿼리 수 제한)
    await Promise.all([loadKwStats(), loadSupStats(), loadMerged(), loadSearchableColumns(), loadKeywordHierarchy()]);
  }, [loadStatistics, loadUnmerged, clusterPageSize, loadKwStats, loadSupStats, loadMerged, loadSearchableColumns, loadKeywordHierarchy]);

  const refreshAll = useCallback(async () => {
    // Phase 1: 핵심 데이터
    await Promise.all([loadStatistics(), loadUnmerged(clusterPage, clusterPageSize, appliedSearchParams)]);
    // Phase 2: 보조 데이터
    await Promise.all([loadKwStats(), loadSupStats(), loadMerged()]);
  }, [loadStatistics, loadUnmerged, clusterPage, clusterPageSize, appliedSearchParams, loadKwStats, loadSupStats, loadMerged]);

  useEffect(() => { if (!isNaN(clusterId)) loadAll(); }, [projectId, sessionId, clusterId]);

  /* === 고급 검색 === */
  const handleAdvancedSearch = async (isSearchWithin = false) => {
    setLoading(true); setClusterPage(0); setSelectAllMode(false); setExceptions(new Set());
    try {
      const params = { clusterId, page: 0, size: clusterPageSize, searchColumn, searchValue: searchKeyword.trim() || null, exactMatch, excludeValue: excludeKeyword.trim() || null, excludeExactMatch, withinClusterNumbers: isSearchWithin && previousResultIds ? previousResultIds : null };
      const r = await detailClusteringService.advancedSearch(projectId, sessionId, params);
      setClusterData(r.data || []); setVisibleColumns(r.columns || []); setClusterTotalCount(r.totalCount || 0); setClusterTotalPages(r.totalPages || 0);
      if (r.resultClusterNumbers) setPreviousResultIds(r.resultClusterNumbers);
      setAppliedSearchParams({ searchColumn, searchValue: searchKeyword.trim() || null, exactMatch, excludeValue: excludeKeyword.trim() || null, excludeExactMatch, isSearchWithin });
    } catch (e) { console.error(e); alert('검색 실패: ' + (e.response?.data?.message || e.message)); } finally { setLoading(false); }
  };
  const handleSearch = () => { searchWithinResults && previousResultIds ? handleAdvancedSearch(true) : handleAdvancedSearch(false); };
  const handleClearSearch = () => {
    setSearchKeyword(''); setExcludeKeyword(''); setExactMatch(false); setExcludeExactMatch(false); setSearchWithinResults(false); setPreviousResultIds(null); setAppliedSearchParams(null);
    setClusterPage(0); setSelectAllMode(false); setExceptions(new Set()); loadUnmerged(0, clusterPageSize, null);
  };

  const handlePageChange = async (p) => {
    setClusterPage(p);
    if (appliedSearchParams) {
      setLoading(true);
      try {
        const params = { clusterId, page: p, size: clusterPageSize, searchColumn: appliedSearchParams.searchColumn, searchValue: appliedSearchParams.searchValue, exactMatch: appliedSearchParams.exactMatch, excludeValue: appliedSearchParams.excludeValue, excludeExactMatch: appliedSearchParams.excludeExactMatch, withinClusterNumbers: appliedSearchParams.isSearchWithin ? previousResultIds : null };
        const r = await detailClusteringService.advancedSearch(projectId, sessionId, params);
        setClusterData(r.data || []); setVisibleColumns(r.columns || []);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    } else { loadUnmerged(p, clusterPageSize, null); }
  };

  const handlePageSizeChange = async (s) => {
    setClusterPageSize(s); setClusterPage(0);
    if (appliedSearchParams) {
      setLoading(true);
      try {
        const params = { clusterId, page: 0, size: s, searchColumn: appliedSearchParams.searchColumn, searchValue: appliedSearchParams.searchValue, exactMatch: appliedSearchParams.exactMatch, excludeValue: appliedSearchParams.excludeValue, excludeExactMatch: appliedSearchParams.excludeExactMatch, withinClusterNumbers: appliedSearchParams.isSearchWithin ? previousResultIds : null };
        const r = await detailClusteringService.advancedSearch(projectId, sessionId, params);
        setClusterData(r.data || []); setVisibleColumns(r.columns || []); setClusterTotalCount(r.totalCount || 0); setClusterTotalPages(r.totalPages || 0);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    } else { loadUnmerged(0, s, null); }
  };

  const handleKeywordHierarchySearch = async (keyword) => {
    setSearchKeyword(keyword); setSearchColumn('keyword'); setExactMatch(true); setExcludeKeyword(''); setExcludeExactMatch(false); setSearchWithinResults(false); setPreviousResultIds(null);
    setClusterPage(0); setSelectAllMode(false); setExceptions(new Set()); setSearchTabMode('basic'); setSearchCollapsed(false);
    setLoading(true);
    try {
      const params = { clusterId, page: 0, size: clusterPageSize, searchColumn: 'keyword', searchValue: keyword, exactMatch: true, excludeValue: null, excludeExactMatch: false, withinClusterNumbers: null };
      const r = await detailClusteringService.advancedSearch(projectId, sessionId, params);
      setClusterData(r.data || []); setVisibleColumns(r.columns || []); setClusterTotalCount(r.totalCount || 0); setClusterTotalPages(r.totalPages || 0);
      if (r.resultClusterNumbers) setPreviousResultIds(r.resultClusterNumbers);
      setAppliedSearchParams({ searchColumn: 'keyword', searchValue: keyword, exactMatch: true, excludeValue: null, excludeExactMatch: false, isSearchWithin: false });
    } catch (e) { console.error(e); alert('검색 실패: ' + (e.response?.data?.message || e.message)); } finally { setLoading(false); }
  };

  const handleAddKeyword = async (level, parentId, keyword) => {
    if (!keyword.trim()) return;
    try { await detailClusteringService.addKeywordHierarchy(projectId, sessionId, level, parentId, keyword.trim()); await loadKeywordHierarchy(); setNewKeywordInput({ level: 0, parentId: null, value: '' }); }
    catch (e) { alert('키워드 추가 실패: ' + (e.response?.data?.message || e.message)); }
  };
  const handleDeleteKeyword = async (id) => {
    if (!window.confirm('키워드를 삭제하시겠습니까? 하위 키워드도 함께 삭제됩니다.')) return;
    try { await detailClusteringService.deleteKeywordHierarchy(projectId, sessionId, id); await loadKeywordHierarchy(); }
    catch (e) { alert('키워드 삭제 실패: ' + (e.response?.data?.message || e.message)); }
  };

  /* === 체크박스 === */
  const isRowChecked = useCallback((cn) => selectAllMode ? !exceptions.has(cn) : exceptions.has(cn), [selectAllMode, exceptions]);
  const handleHeaderCheck = (checked) => { setSelectAllMode(!!checked); setExceptions(new Set()); };
  const handleRowCheck = useCallback((cn, checked) => {
    setExceptions(prev => { const next = new Set(prev); if (selectAllMode) { checked ? next.delete(cn) : next.add(cn); } else { checked ? next.add(cn) : next.delete(cn); } return next; });
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
      let all;
      if (appliedSearchParams) {
        all = await detailClusteringService.getAdvancedSearchClusterNumbers(projectId, sessionId, { clusterId, searchColumn: appliedSearchParams.searchColumn, searchValue: appliedSearchParams.searchValue, exactMatch: appliedSearchParams.exactMatch, excludeValue: appliedSearchParams.excludeValue, excludeExactMatch: appliedSearchParams.excludeExactMatch, withinClusterNumbers: appliedSearchParams.isSearchWithin ? previousResultIds : null });
      } else {
        all = await detailClusteringService.getAllUnmergedClusterNumbers(projectId, sessionId, clusterId, null);
      }
      return all.filter(id => !exceptions.has(id));
    }
    return Array.from(exceptions);
  }, [selectAllMode, exceptions, projectId, sessionId, clusterId, appliedSearchParams, previousResultIds]);

  /* === 드래그 선택 === */
  const handleTableRowMouseDown = useCallback((row, idx, e) => {
    if (e.button !== 0) return; if (e.target.closest('[role="checkbox"]')) return; e.preventDefault();
    const cn = row.clusterNumber;
    if (e.ctrlKey || e.metaKey) { handleRowCheck(cn, !isRowChecked(cn)); return; }
    setIsDraggingRow(true); const currentlyChecked = isRowChecked(cn); dragRowAction.current = currentlyChecked ? 'uncheck' : 'check'; dragRowStart.current = idx; handleRowCheck(cn, !currentlyChecked);
  }, [isRowChecked, handleRowCheck]);

  const handleTableRowMouseEnter = useCallback((row, idx) => {
    if (!isDraggingRow || dragRowStart.current === null) return;
    const lo = Math.min(dragRowStart.current, idx), hi = Math.max(dragRowStart.current, idx);
    const action = dragRowAction.current;
    setExceptions(prev => { const next = new Set(prev); for (let i = lo; i <= hi; i++) { const cn = clusterData[i]?.clusterNumber; if (cn == null) continue; if (selectAllMode) { action === 'check' ? next.delete(cn) : next.add(cn); } else { action === 'check' ? next.add(cn) : next.delete(cn); } } return next; });
  }, [isDraggingRow, selectAllMode, clusterData]);

  /* === 세부 병합 === */
  const handleMerge = async () => {
    if (selectedCount < 2) { alert('2개 이상의 클러스터를 선택하세요.'); return; }
    if (!window.confirm(`선택한 ${selectedCount}개 클러스터를 세부 병합하시겠습니까?`)) return;
    setMerging(true); setMergingProgress(0);
    try {
      const pi = setInterval(() => setMergingProgress(prev => Math.min(prev + 10, 90)), 200);
      const nums = await getSelectedClusterNumbers();
      await detailClusteringService.mergeClusters(projectId, sessionId, clusterId, nums);
      clearInterval(pi); setMergingProgress(100); await new Promise(r => setTimeout(r, 300));
      setSelectAllMode(false); setExceptions(new Set()); await refreshAll();
    } catch (e) { alert('세부 병합 실패: ' + (e.response?.data?.message || e.message)); } finally { setMerging(false); setMergingProgress(0); }
  };

  const handleAddToMerged = async (targetMergedNumber) => {
    if (selectedCount === 0) return;
    setMerging(true); setMergingProgress(0); setMergingClusters(new Set([targetMergedNumber]));
    try {
      const pi = setInterval(() => setMergingProgress(prev => Math.min(prev + 10, 90)), 200);
      const nums = await getSelectedClusterNumbers();
      await detailClusteringService.addToMergedCluster(projectId, sessionId, clusterId, targetMergedNumber, nums);
      clearInterval(pi); setMergingProgress(100); await new Promise(r => setTimeout(r, 300));
      setSelectAllMode(false); setExceptions(new Set()); setAddMergeDialog(false); await refreshAll();
    } catch (e) { alert('추가 세부 병합 실패: ' + (e.response?.data?.message || e.message)); } finally { setMerging(false); setMergingProgress(0); setMergingClusters(new Set()); }
  };

  /* === 키워드/공급업체 자세히 === */
  const handleKwDetail = async (keyword) => {
    setSearchColumn('keyword'); setSearchKeyword(keyword); setExactMatch(true); setExcludeKeyword(''); setExcludeExactMatch(false); setSearchWithinResults(false); setPreviousResultIds(null);
    setClusterPage(0); setSelectAllMode(false); setExceptions(new Set()); setSearchTabMode('basic'); setSearchCollapsed(false);
    setLoading(true);
    try {
      const params = { clusterId, page: 0, size: clusterPageSize, searchColumn: 'keyword', searchValue: keyword, exactMatch: true, excludeValue: null, excludeExactMatch: false, withinClusterNumbers: null };
      const r = await detailClusteringService.advancedSearch(projectId, sessionId, params);
      setClusterData(r.data || []); setVisibleColumns(r.columns || []); setClusterTotalCount(r.totalCount || 0); setClusterTotalPages(r.totalPages || 0);
      if (r.resultClusterNumbers) setPreviousResultIds(r.resultClusterNumbers);
      setAppliedSearchParams({ searchColumn: 'keyword', searchValue: keyword, exactMatch: true, excludeValue: null, excludeExactMatch: false, isSearchWithin: false });
    } catch (e) { console.error(e); alert('검색 실패: ' + (e.response?.data?.message || e.message)); } finally { setLoading(false); }
  };

  const handleSupDetail = async (supplier) => {
    setSearchColumn('supplier'); setSearchKeyword(supplier); setExactMatch(true); setExcludeKeyword(''); setExcludeExactMatch(false); setSearchWithinResults(false); setPreviousResultIds(null);
    setClusterPage(0); setSelectAllMode(false); setExceptions(new Set()); setSearchTabMode('basic'); setSearchCollapsed(false);
    setLoading(true);
    try {
      const params = { clusterId, page: 0, size: clusterPageSize, searchColumn: 'supplier', searchValue: supplier, exactMatch: true, excludeValue: null, excludeExactMatch: false, withinClusterNumbers: null };
      const r = await detailClusteringService.advancedSearch(projectId, sessionId, params);
      setClusterData(r.data || []); setVisibleColumns(r.columns || []); setClusterTotalCount(r.totalCount || 0); setClusterTotalPages(r.totalPages || 0);
      if (r.resultClusterNumbers) setPreviousResultIds(r.resultClusterNumbers);
      setAppliedSearchParams({ searchColumn: 'supplier', searchValue: supplier, exactMatch: true, excludeValue: null, excludeExactMatch: false, isSearchWithin: false });
    } catch (e) { console.error(e); alert('검색 실패: ' + (e.response?.data?.message || e.message)); } finally { setLoading(false); }
  };

  const handleAutoMergeByKeywords = async () => {
    if (kwCheckedSet.size === 0) { alert('키워드를 선택해주세요.'); return; }
    if (!window.confirm(`선택한 ${kwCheckedSet.size}개 키워드의 클러스터를 자동 세부 병합합니다.`)) return;
    setMerging(true);
    try {
      for (const keyword of kwCheckedSet) {
        const ids = await detailClusteringService.getAllUnmergedClusterNumbers(projectId, sessionId, clusterId, keyword);
        if (ids.length >= 2) await detailClusteringService.mergeClusters(projectId, sessionId, clusterId, ids);
      }
      setKwCheckedSet(new Set()); setSelectAllMode(false); setExceptions(new Set()); await refreshAll();
    } catch (e) { alert('자동 세부 클러스터링 실패: ' + (e.response?.data?.message || e.message)); } finally { setMerging(false); }
  };

  const handleAutoMergeBySuppliers = async () => {
    if (supCheckedSet.size === 0) { alert('공급업체를 선택해주세요.'); return; }
    if (!window.confirm(`선택한 ${supCheckedSet.size}개 공급업체의 클러스터를 자동 세부 병합합니다.`)) return;
    setMerging(true);
    try {
      for (const supplier of supCheckedSet) {
        const ids = await detailClusteringService.getAllUnmergedClusterNumbers(projectId, sessionId, clusterId, null, supplier);
        if (ids.length >= 2) await detailClusteringService.mergeClusters(projectId, sessionId, clusterId, ids);
      }
      setSupCheckedSet(new Set()); setSelectAllMode(false); setExceptions(new Set());
      await refreshAll();
    } catch (e) { alert('자동 세부 클러스터링 실패: ' + (e.response?.data?.message || e.message)); } finally { setMerging(false); }
  };

  /* === 통계 정렬 === */
  const handleKwSort = (f) => { if (kwSortField === f) setKwSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setKwSortField(f); setKwSortDir('desc'); } };
  const handleSupSort = (f) => { if (supSortField === f) setSupSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSupSortField(f); setSupSortDir('desc'); } };
  const sortedKwStats = useMemo(() => { const s = [...keywordStats]; s.sort((a, b) => { const av = a[kwSortField], bv = b[kwSortField]; if (typeof av === 'string') return kwSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); return kwSortDir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0); }); return s; }, [keywordStats, kwSortField, kwSortDir]);
  const sortedSupStats = useMemo(() => { const s = [...supplierStats]; s.sort((a, b) => { const av = a[supSortField], bv = b[supSortField]; if (typeof av === 'string') return supSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); return supSortDir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0); }); return s; }, [supplierStats, supSortField, supSortDir]);

  /* === 세부 병합 결과 관리 === */
  const handleUnmerge = async (cn) => {
    if (!window.confirm(`클러스터 #${cn}의 세부 병합을 해제하시겠습니까?`)) return;
    setUnmergingClusters(prev => new Set(prev).add(cn));
    try { await detailClusteringService.unmergeClusters(projectId, sessionId, clusterId, cn); setSelectedMerged(new Set()); await refreshAll(); }
    catch (e) { alert('세부 병합 해제 실패: ' + (e.response?.data?.message || e.message)); }
    finally { setUnmergingClusters(prev => { const n = new Set(prev); n.delete(cn); return n; }); }
  };

  const handleBulkUnmerge = async () => {
    if (selectedMerged.size === 0) return;
    if (!window.confirm(`${selectedMerged.size}개 세부 병합 클러스터를 해제하시겠습니까?`)) return;
    setUnmerging(true); setUnmergingProgress(0); setUnmergingClusters(new Set(selectedMerged));
    try {
      const total = selectedMerged.size; let done = 0;
      for (const cn of selectedMerged) { await detailClusteringService.unmergeClusters(projectId, sessionId, clusterId, cn); done++; setUnmergingProgress(Math.round((done / total) * 100)); }
      await new Promise(r => setTimeout(r, 300)); setSelectedMerged(new Set()); await refreshAll();
    } catch (e) { alert('세부 병합 해제 실패: ' + (e.response?.data?.message || e.message)); }
    finally { setUnmerging(false); setUnmergingProgress(0); setUnmergingClusters(new Set()); }
  };

  const handleMergeMerged = async () => {
    if (selectedMerged.size < 2) { alert('2개 이상의 세부 병합 클러스터를 선택하세요.'); return; }
    if (!window.confirm(`${selectedMerged.size}개 세부 병합 클러스터를 하나로 합치시겠습니까?`)) return;
    setMerging(true); setMergingClusters(new Set(selectedMerged)); setMergingProgress(0);
    try {
      const pi = setInterval(() => setMergingProgress(prev => Math.min(prev + 10, 90)), 200);
      await detailClusteringService.mergeMergedClusters(projectId, sessionId, clusterId, Array.from(selectedMerged));
      clearInterval(pi); setMergingProgress(100); await new Promise(r => setTimeout(r, 300));
      setSelectedMerged(new Set()); await refreshAll();
    } catch (e) { alert('세부 병합 실패: ' + (e.response?.data?.message || e.message)); }
    finally { setMerging(false); setMergingClusters(new Set()); setMergingProgress(0); }
  };

  /* === 상세 다이얼로그 === */
  const handleOpenDetail = (cluster) => { setDetailDialog({ open: true, cluster }); setDetailChecked(new Set()); setDetailDragging(false); detailDragStart.current = null; detailDragAction.current = null; };
  const handleDetailRowMouseDown = useCallback((row, idx, e) => {
    if (e.button !== 0) return; if (e.target.closest('[role="checkbox"]')) return; e.preventDefault();
    const cn = row.clusterNumber;
    if (e.ctrlKey || e.metaKey) { setDetailChecked(prev => { const next = new Set(prev); next.has(cn) ? next.delete(cn) : next.add(cn); return next; }); return; }
    setDetailDragging(true); const cc = detailChecked.has(cn); detailDragAction.current = cc ? 'uncheck' : 'check'; detailDragStart.current = idx;
    setDetailChecked(prev => { const next = new Set(prev); cc ? next.delete(cn) : next.add(cn); return next; });
  }, [detailChecked]);
  const handleDetailRowMouseEnter = useCallback((row, idx) => {
    if (!detailDragging || detailDragStart.current === null) return;
    const children = detailDialog.cluster?.children || []; const lo = Math.min(detailDragStart.current, idx), hi = Math.max(detailDragStart.current, idx); const action = detailDragAction.current;
    setDetailChecked(prev => { const next = new Set(prev); for (let i = lo; i <= hi; i++) { const cn = children[i]?.clusterNumber; if (cn == null) continue; action === 'check' ? next.add(cn) : next.delete(cn); } return next; });
  }, [detailDragging, detailDialog.cluster]);
  const handlePartialUnmerge = async () => {
    if (detailChecked.size === 0) { alert('해제할 항목을 선택하세요.'); return; }
    if (!window.confirm(`선택한 ${detailChecked.size}개 클러스터를 세부 병합 해제하시겠습니까?`)) return;
    try { await detailClusteringService.unmergePartialClusters(projectId, sessionId, clusterId, detailDialog.cluster.clusterNumber, Array.from(detailChecked)); setDetailDialog({ open: false, cluster: null }); setDetailChecked(new Set()); await refreshAll(); }
    catch (e) { alert('부분 해제 실패: ' + (e.response?.data?.message || e.message)); }
  };

  const handleOpenRename = (c) => { setRenameDialog({ open: true, cluster: c }); setNewClusterName(c.clusterName); };
  const handleRename = async () => {
    if (!newClusterName.trim()) return;
    try { await detailClusteringService.renameCluster(projectId, sessionId, renameDialog.cluster.clusterNumber, newClusterName); setRenameDialog({ open: false, cluster: null }); await refreshAll(); }
    catch (e) { alert('이름 변경 실패: ' + (e.response?.data?.message || e.message)); }
  };

  const handleComplete = async () => {
    navigate(`/projects/${projectId}/sessions/${sessionId}/export`);
  };

  /* === 테이블 컬럼 === */
  const clusterColumns = useMemo(() => {
    const cols = [
      { key: '_cb', label: '', pinned: true, sortable: false, resizable: false, width: 50,
        headerRender: () => <Checkbox checked={isHeaderChecked} ref={el => { if (el) el.indeterminate = isHeaderIndeterminate; }} onCheckedChange={handleHeaderCheck} />,
        render: (row) => <Checkbox checked={isRowChecked(row.clusterNumber)} onCheckedChange={c => handleRowCheck(row.clusterNumber, c)} />,
      },
      { key: 'clusterNumber', label: '클러스터번호', pinned: true, sortable: true, width: 110, render: r => <Badge variant="outline" className="text-[10px] font-mono">#{r.clusterNumber}</Badge> },
      { key: 'clusterName', label: '클러스터명', sortable: true, minWidth: 150, render: r => <span className="whitespace-nowrap" title={r.clusterName}>{truncateName(r.clusterName)}</span> },
      { key: 'keywords', label: '키워드', sortable: false, minWidth: 200, render: r => <div className="flex flex-wrap gap-1">{(r.keywords || []).map((k, i) => <Badge key={i} variant="secondary" className="text-[10px]">{k}</Badge>)}</div> },
      { key: 'count', label: 'Count', sortable: true, width: 90, cellClassName: 'text-right', headerClassName: 'text-right', render: r => <span className="block text-right">{(r.count || 0).toLocaleString()}</span> },
      { key: 'totalAmount', label: `금액(${amountUnit})`, sortable: true, width: 130, cellClassName: 'text-right', headerClassName: 'text-right', render: r => <span className="block text-right">{formatAmount(r.totalAmount || 0)}</span> },
    ];
    if (visibleColumns?.length) { for (const colName of visibleColumns) { cols.push({ key: `rep_${colName}`, label: colName, sortable: false, minWidth: 100, render: r => { const v = r.representativeData?.[colName]; return <span className="whitespace-nowrap text-xs">{v != null ? String(v) : ''}</span>; } }); } }
    return cols;
  }, [isHeaderChecked, isHeaderIndeterminate, selectAllMode, exceptions, visibleColumns, amountUnit, formatAmount]);

  const detailColumns = useMemo(() => {
    const all = detailDialog.cluster?.children?.length || 0;
    const isAllChecked = detailChecked.size === all && all > 0;
    const isIndeterminate = detailChecked.size > 0 && detailChecked.size < all;
    const cols = [
      { key: '_cb', label: '', pinned: true, sortable: false, resizable: false, width: 40,
        headerRender: () => <Checkbox checked={isAllChecked} ref={el => { if (el) el.indeterminate = isIndeterminate; }} onCheckedChange={c => { if (c) setDetailChecked(new Set((detailDialog.cluster?.children || []).map(ch => ch.clusterNumber))); else setDetailChecked(new Set()); }} />,
        render: r => <Checkbox checked={detailChecked.has(r.clusterNumber)} onCheckedChange={c => setDetailChecked(prev => { const n = new Set(prev); c ? n.add(r.clusterNumber) : n.delete(r.clusterNumber); return n; })} />,
      },
      { key: 'clusterNumber', label: '#', pinned: true, sortable: false, width: 70, render: r => <Badge variant="outline" className="text-[10px] font-mono">#{r.clusterNumber}</Badge> },
      { key: 'clusterName', label: '클러스터명', sortable: false, minWidth: 120, render: r => <span className="whitespace-nowrap">{truncateName(r.clusterName)}</span> },
      { key: 'keywords', label: '키워드', sortable: false, minWidth: 160, render: r => <div className="flex flex-wrap gap-0.5">{(r.keywords||[]).map((k,i)=><Badge key={i} variant="secondary" className="text-[9px]">{k}</Badge>)}</div> },
      { key: 'count', label: 'Count', sortable: false, width: 70, cellClassName: 'text-right', render: r => <span className="block text-right text-xs">{(r.count||0).toLocaleString()}</span> },
      { key: 'totalAmount', label: `금액(${amountUnit})`, sortable: false, width: 100, cellClassName: 'text-right', render: r => <span className="block text-right text-xs">{formatAmount(r.totalAmount||0)}</span> },
    ];
    const visCols = detailDialog.cluster?.columns || [];
    for (const colName of visCols) { cols.push({ key: `rep_${colName}`, label: colName, sortable: false, minWidth: 80, render: r => { const v = r.representativeData?.[colName]; return <span className="text-xs whitespace-nowrap">{v != null ? String(v) : ''}</span>; } }); }
    return cols;
  }, [detailDialog.cluster, detailChecked, amountUnit, formatAmount]);

  /* === 렌더 === */
  if (isNaN(clusterId)) {
    return (<div className="flex items-center justify-center h-full"><Card className="p-8"><p className="text-lg font-semibold text-red-600">clusterId가 지정되지 않았습니다.</p><Button className="mt-4" onClick={() => navigate(`/projects/${projectId}/sessions/${sessionId}/export`)}>Export 페이지로 돌아가기</Button></Card></div>);
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">
        <div className="flex-shrink-0 space-y-4 mb-4">
          <Breadcrumb><BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/projects"><Home className="h-4 w-4" /></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
            <BreadcrumbItem><BreadcrumbLink href={`/projects/${projectId}/upload`}>프로젝트</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
            <BreadcrumbItem><BreadcrumbLink href={`/projects/${projectId}/sessions/${sessionId}/export`}>Export</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
            <BreadcrumbItem><BreadcrumbPage className="font-semibold">Step 7: 세부 클러스터링 (클러스터 #{clusterId})</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList></Breadcrumb>
          <Card className="shadow-sm"><CardContent className="py-3">
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <span><span className="font-semibold">전체 행수:</span> <Badge variant="secondary">{(statistics.totalRows||0).toLocaleString()}</Badge></span>
              <span><span className="font-semibold">미세부병합 클러스터:</span> <Badge variant="secondary">{(statistics.unmergedCount||0).toLocaleString()}</Badge></span>
              <span><span className="font-semibold">미세부병합 합산:</span> <Badge variant="secondary">{formatAmount(statistics.unmergedTotalAmount||0)}</Badge></span>
              <span><span className="font-semibold">세부 병합 그룹:</span> <Badge variant="secondary">{(statistics.mergedGroupCount||0).toLocaleString()}</Badge></span>
            </div>
          </CardContent></Card>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* 좌측: 미세부병합 클러스터 */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-3">
            {/* 검색 */}
            <Card className="flex-shrink-0 shadow-sm">
              <CardHeader className="py-2 px-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setSearchCollapsed(!searchCollapsed)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2"><Search className="h-4 w-4" />검색 설정{appliedSearchParams && <Badge variant="secondary" className="text-[10px] ml-2">검색 적용됨</Badge>}</CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">{searchCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>
                </div>
              </CardHeader>
              {!searchCollapsed && (
              <CardContent className="py-2 px-4 pt-0">
                <div className="flex items-center gap-2 mb-2 border-b pb-2">
                  <Button variant={searchTabMode === 'basic' ? 'default' : 'ghost'} size="sm" className="h-6 text-xs px-2" onClick={() => setSearchTabMode('basic')}><Search className="h-3 w-3 mr-1" />검색 설정</Button>
                  <Button variant={searchTabMode === 'keyword-hierarchy' ? 'default' : 'ghost'} size="sm" className="h-6 text-xs px-2" onClick={() => setSearchTabMode('keyword-hierarchy')}><Folder className="h-3 w-3 mr-1" />추천 키워드</Button>
                </div>
                {searchTabMode === 'basic' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={searchColumn} onValueChange={setSearchColumn}><SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="검색 기준" /></SelectTrigger><SelectContent>{searchableColumns.map(col => <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>)}</SelectContent></Select>
                      <Input className="h-8 text-sm flex-1 min-w-[150px]" placeholder="검색 키워드 입력..." value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                      <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap"><Checkbox checked={exactMatch} onCheckedChange={setExactMatch} />완전일치</label>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground w-[120px]">제외 키워드:</span>
                      <Input className="h-8 text-sm flex-1 min-w-[150px]" placeholder="제외 항목 입력..." value={excludeKeyword} onChange={e => setExcludeKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                      <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap"><Checkbox checked={excludeExactMatch} onCheckedChange={setExcludeExactMatch} />완전일치</label>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-1 text-xs cursor-pointer"><Checkbox checked={searchWithinResults} onCheckedChange={setSearchWithinResults} disabled={!previousResultIds || previousResultIds.length === 0} />결과 내 재검색</label>
                      {previousResultIds && previousResultIds.length > 0 && <span className="text-[10px] text-muted-foreground">(이전 결과: {previousResultIds.length.toLocaleString()}건)</span>}
                      <div className="flex-1" />
                      <Button size="sm" className="h-8" onClick={handleSearch}><Search className="h-3 w-3 mr-1" />검색</Button>
                      {appliedSearchParams && <Button size="sm" variant="outline" className="h-8" onClick={handleClearSearch}><X className="h-3 w-3 mr-1" />초기화</Button>}
                    </div>
                    {appliedSearchParams && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                        <Badge variant="secondary" className="text-[10px]">{searchableColumns.find(c => c.key === appliedSearchParams.searchColumn)?.label || appliedSearchParams.searchColumn}{appliedSearchParams.exactMatch ? '=' : '~'}"{appliedSearchParams.searchValue || ''}"</Badge>
                        {appliedSearchParams.excludeValue && <Badge variant="outline" className="text-[10px] text-red-600">제외: {appliedSearchParams.excludeExactMatch ? '=' : '~'}"{appliedSearchParams.excludeValue}"</Badge>}
                        {appliedSearchParams.isSearchWithin && <Badge variant="outline" className="text-[10px] text-blue-600">결과내 재검색</Badge>}
                        <span className="text-muted-foreground">{clusterTotalCount.toLocaleString()}건</span>
                      </div>
                    )}
                  </div>
                )}
                {searchTabMode === 'keyword-hierarchy' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input className="h-7 text-xs flex-1" placeholder="새 Lv1 키워드 입력..." value={newKeywordInput.level === 1 && !newKeywordInput.parentId ? newKeywordInput.value : ''} onChange={e => setNewKeywordInput({ level: 1, parentId: null, value: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAddKeyword(1, null, newKeywordInput.value)} />
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleAddKeyword(1, null, newKeywordInput.value)}><Plus className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={loadKeywordHierarchy} disabled={kwHierarchyLoading}><RefreshCw className={`h-3 w-3 ${kwHierarchyLoading ? 'animate-spin' : ''}`} /></Button>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto border rounded p-2 text-xs space-y-1">
                      {keywordHierarchy.length === 0 ? <div className="text-center text-muted-foreground py-4">등록된 추천 키워드가 없습니다</div> : keywordHierarchy.map(lv1 => (
                        <div key={lv1.id} className="space-y-1">
                          <div className="flex items-center gap-1 p-1 rounded hover:bg-gray-100">
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setExpandedLv1(prev => { const next = new Set(prev); next.has(lv1.id) ? next.delete(lv1.id) : next.add(lv1.id); return next; })}>{expandedLv1.has(lv1.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</Button>
                            <FolderOpen className="h-3 w-3 text-yellow-600" />
                            <span className="flex-1 cursor-pointer hover:text-blue-600 hover:underline" onClick={() => handleKeywordHierarchySearch(lv1.keyword)}>{lv1.keyword}</span>
                            <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-blue-600" onClick={() => setKeywordHierarchyDialog({ open: true, parentId: lv1.id, parentKeyword: lv1.keyword, level: 2 })}>자세히</Button>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-500" onClick={() => handleDeleteKeyword(lv1.id)}><X className="h-3 w-3" /></Button>
                          </div>
                          {expandedLv1.has(lv1.id) && lv1.children && lv1.children.length > 0 && (
                            <div className="ml-6 space-y-1">{lv1.children.map(lv2 => (
                              <div key={lv2.id} className="space-y-1">
                                <div className="flex items-center gap-1 p-1 rounded hover:bg-gray-50">
                                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setExpandedLv2(prev => { const next = new Set(prev); next.has(lv2.id) ? next.delete(lv2.id) : next.add(lv2.id); return next; })}>{lv2.children?.length > 0 ? (expandedLv2.has(lv2.id) ? <ChevronDown className="h-2 w-2" /> : <ChevronRight className="h-2 w-2" />) : <span className="w-2" />}</Button>
                                  <Folder className="h-3 w-3 text-blue-500" />
                                  <span className="flex-1 cursor-pointer hover:text-blue-600 hover:underline" onClick={() => handleKeywordHierarchySearch(lv2.keyword)}>{lv2.keyword}</span>
                                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-red-500" onClick={() => handleDeleteKeyword(lv2.id)}><X className="h-2 w-2" /></Button>
                                </div>
                                {expandedLv2.has(lv2.id) && lv2.children && lv2.children.length > 0 && (
                                  <div className="ml-5 space-y-0.5">{lv2.children.map(lv3 => (
                                    <div key={lv3.id} className="flex items-center gap-1 p-0.5 rounded hover:bg-gray-50">
                                      <Tag className="h-2 w-2 text-green-500" /><span className="flex-1 cursor-pointer hover:text-blue-600 hover:underline text-[10px]" onClick={() => handleKeywordHierarchySearch(lv3.keyword)}>{lv3.keyword}</span>
                                      <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-red-500" onClick={() => handleDeleteKeyword(lv3.id)}><X className="h-2 w-2" /></Button>
                                    </div>
                                  ))}</div>
                                )}
                              </div>
                            ))}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>)}
            </Card>

            {/* 세부 병합 액션 */}
            <Card className="flex-shrink-0 shadow-sm"><CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Button size="sm" className="h-8 min-w-[120px] relative overflow-hidden" onClick={handleMerge} disabled={selectedCount < 2 || merging || unmerging}>
                    {merging && mergingClusters.size === 0 && <div className="absolute inset-0 bg-blue-300/50 transition-all" style={{ width: `${mergingProgress}%` }} />}
                    <span className="relative z-10 flex items-center">{merging && mergingClusters.size === 0 ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{mergingProgress}%</> : <><GitMerge className="h-3 w-3 mr-1" />세부 병합 ({selectedCount})</>}</span>
                  </Button>
                </div>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setAddMergeDialog(true)} disabled={selectedCount === 0 || mergedClusters.length === 0 || merging || unmerging}><Plus className="h-3 w-3 mr-1" />추가 세부 병합</Button>
                <div className="flex-1" />
                <Select value={amountUnit} onValueChange={setAmountUnit}><SelectTrigger className="w-[80px] h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{['원','천원','백만원','억원'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>
              </div>
            </CardContent></Card>

            {/* 미세부병합 테이블 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-2.5 px-4 border-b bg-white flex-shrink-0"><CardTitle className="text-sm font-bold">미세부병합 클러스터 ({clusterTotalCount.toLocaleString()}건)</CardTitle></CardHeader>
              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                <AdvancedTable columns={clusterColumns} data={clusterData} rowKey={r => r.clusterNumber} sort={sort} onSortChange={(f, d) => setSort({ field: f, direction: d })} loading={loading} emptyMessage="클러스터 데이터가 없습니다." onRowMouseDown={handleTableRowMouseDown} onRowMouseEnter={handleTableRowMouseEnter} rowClassName={(r) => isRowChecked(r.clusterNumber) ? 'bg-blue-50' : ''} />
              </CardContent>
              <Pagination currentPage={clusterPage} totalPages={clusterTotalPages} totalCount={clusterTotalCount} pageSize={clusterPageSize} onPageChange={handlePageChange} onPageSizeChange={handlePageSizeChange} />
            </Card>
          </div>

          {/* 우측 */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">
            <div className="flex flex-col" style={{ height: '60%', minHeight: '200px' }}>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <TabsList className={`grid w-full flex-shrink-0 ${statistics.hasSupplier ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <TabsTrigger value="keyword">키워드별</TabsTrigger>
                  {statistics.hasSupplier && <TabsTrigger value="supplier">공급업체별</TabsTrigger>}
                </TabsList>
                <div className="flex-1 min-h-0 mt-2 relative">
                  <div className={`absolute inset-0 flex flex-col ${activeTab === 'keyword' ? '' : 'hidden'}`}>
                    <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      <CardHeader className="py-2 px-3 border-b flex-shrink-0"><div className="flex items-center justify-between"><CardTitle className="text-sm font-bold">키워드 통계 ({keywordStats.length}건)</CardTitle><Button variant="ghost" size="sm" className="h-7 px-2" onClick={loadKwStats} disabled={kwLoading}><RefreshCw className={`h-3 w-3 ${kwLoading ? 'animate-spin' : ''}`} /></Button></div></CardHeader>
                      <CardContent className="p-0 flex-1 overflow-auto"><StatsListView items={sortedKwStats} checkedSet={kwCheckedSet} onCheckedChange={setKwCheckedSet} nameKey="keyword" nameLabel="키워드" sortField={kwSortField} sortDir={kwSortDir} onSort={handleKwSort} formatAmount={formatAmount} amountUnit={amountUnit} onDetail={handleKwDetail} isDragging={kwDragging} setIsDragging={setKwDragging} dragStartRef={kwDragRef} /></CardContent>
                    </Card>
                    <Button className="w-full mt-2 bg-purple-600 hover:bg-purple-700 h-8 text-sm font-semibold flex-shrink-0" onClick={handleAutoMergeByKeywords} disabled={kwCheckedSet.size === 0 || merging}>{merging && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}<GitMerge className="h-3 w-3 mr-1" />선택항목 자동 세부 클러스터링 ({kwCheckedSet.size})</Button>
                  </div>
                  {statistics.hasSupplier && (
                    <div className={`absolute inset-0 flex flex-col ${activeTab === 'supplier' ? '' : 'hidden'}`}>
                      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <CardHeader className="py-2 px-3 border-b flex-shrink-0"><div className="flex items-center justify-between"><CardTitle className="text-sm font-bold">공급업체 통계 ({supplierStats.length}건)</CardTitle><Button variant="ghost" size="sm" className="h-7 px-2" onClick={loadSupStats} disabled={supLoading}><RefreshCw className={`h-3 w-3 ${supLoading ? 'animate-spin' : ''}`} /></Button></div></CardHeader>
                        <CardContent className="p-0 flex-1 overflow-auto"><StatsListView items={sortedSupStats} checkedSet={supCheckedSet} onCheckedChange={setSupCheckedSet} nameKey="supplier" nameLabel="공급업체" sortField={supSortField} sortDir={supSortDir} onSort={handleSupSort} formatAmount={formatAmount} amountUnit={amountUnit} onDetail={handleSupDetail} isDragging={supDragging} setIsDragging={setSupDragging} dragStartRef={supDragRef} /></CardContent>
                      </Card>
                      <Button className="w-full mt-2 bg-purple-600 hover:bg-purple-700 h-8 text-sm font-semibold flex-shrink-0" onClick={handleAutoMergeBySuppliers} disabled={supCheckedSet.size === 0 || merging}>{merging && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}<GitMerge className="h-3 w-3 mr-1" />선택항목 자동 세부 클러스터링 ({supCheckedSet.size})</Button>
                    </div>
                  )}
                </div>
              </Tabs>
            </div>

            {/* 세부 병합 결과 */}
            <div className="flex flex-col mt-3" style={{ height: '40%', minHeight: '150px' }}>
              <Card className="flex-1 flex flex-col min-h-0 overflow-hidden shadow-sm">
                <CardHeader className="py-2 px-3 border-b flex-shrink-0">
                  <div className="flex items-center justify-between gap-1">
                    <CardTitle className="text-sm font-bold">세부 병합 결과 ({mergedClusters.length})</CardTitle>
                    <div className="flex items-center gap-1">
                      <div className="relative">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs min-w-[120px] relative overflow-hidden" onClick={handleMergeMerged} disabled={selectedMerged.size < 2 || merging}>
                          {merging && mergingClusters.size > 0 && <div className="absolute inset-0 bg-blue-100 transition-all" style={{ width: `${mergingProgress}%` }} />}
                          <span className="relative z-10 flex items-center">{merging && mergingClusters.size > 0 ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{mergingProgress}%</> : <><GitMerge className="h-3 w-3 mr-1" />세부 병합 merge ({selectedMerged.size})</>}</span>
                        </Button>
                      </div>
                      <div className="relative">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 min-w-[100px] relative overflow-hidden" onClick={handleBulkUnmerge} disabled={selectedMerged.size === 0 || merging || unmerging}>
                          {unmerging && <div className="absolute inset-0 bg-red-100 transition-all" style={{ width: `${unmergingProgress}%` }} />}
                          <span className="relative z-10 flex items-center">{unmerging ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{unmergingProgress}%</> : <><Trash2 className="h-3 w-3 mr-1" />해제 ({selectedMerged.size})</>}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-auto">
                  {mergedClusters.length === 0 ? <div className="text-center py-8 text-xs text-muted-foreground">세부 병합된 클러스터가 없습니다</div> : (
                    <div className="text-xs">
                      <div className="grid grid-cols-[28px_1fr_60px_90px_60px] gap-1 items-center px-2 py-2 border-b bg-gray-100 font-semibold text-muted-foreground sticky top-0 z-10">
                        <Checkbox checked={selectedMerged.size === mergedClusters.length && mergedClusters.length > 0} disabled={merging && mergingClusters.size > 0} onCheckedChange={c => { if (c) setSelectedMerged(new Set(mergedClusters.map(m => m.clusterNumber))); else setSelectedMerged(new Set()); }} />
                        <div>클러스터명</div><div className="text-right">Count</div><div className="text-right">금액({amountUnit})</div><div className="text-center">관리</div>
                      </div>
                      {mergedClusters.map(c => {
                        const isMergingThis = mergingClusters.has(c.clusterNumber); const isUnmergingThis = unmergingClusters.has(c.clusterNumber); const isBusy = isMergingThis || isUnmergingThis;
                        return (
                          <div key={c.clusterNumber} className={`grid grid-cols-[28px_1fr_60px_90px_60px] gap-1 items-center px-2 py-1.5 border-b transition-colors ${isMergingThis ? 'bg-yellow-50 opacity-70' : isUnmergingThis ? 'bg-red-50 opacity-70' : selectedMerged.has(c.clusterNumber) ? 'bg-blue-50' : 'hover:bg-muted/50'}`}>
                            <Checkbox checked={selectedMerged.has(c.clusterNumber)} disabled={isBusy} onCheckedChange={ch => setSelectedMerged(prev => { const n = new Set(prev); ch ? n.add(c.clusterNumber) : n.delete(c.clusterNumber); return n; })} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-[9px] font-mono flex-shrink-0">#{c.clusterNumber}</Badge>
                                <span className="truncate" title={c.clusterName}>{isMergingThis ? <span className="text-yellow-600 font-semibold">세부 병합중...</span> : isUnmergingThis ? <span className="text-red-600 font-semibold">해제중...</span> : truncateName(c.clusterName)}</span>
                              </div>
                              <div className="flex flex-wrap gap-0.5 mt-0.5">{(c.keywords || []).slice(0, 4).map((k, i) => <Badge key={i} variant="secondary" className="text-[8px]">{k}</Badge>)}{(c.keywords || []).length > 4 && <Badge variant="secondary" className="text-[8px]">+{c.keywords.length - 4}</Badge>}</div>
                            </div>
                            <div className="text-right tabular-nums">{(c.count||0).toLocaleString()}</div>
                            <div className="text-right tabular-nums">{formatAmount(c.totalAmount||0)}</div>
                            <div className="flex items-center justify-center gap-0.5">
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleOpenDetail(c)} title="상세" disabled={isBusy}><Eye className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleOpenRename(c)} title="이름변경" disabled={isBusy}><Edit2 className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => handleUnmerge(c.clusterNumber)} title="세부 병합해제" disabled={isBusy}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Button className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold flex-shrink-0" onClick={handleComplete}>완료 → Step 6: Export</Button>
            </div>
          </div>
        </div>
      </div>

      {/* 추가 세부 병합 다이얼로그 */}
      <Dialog open={addMergeDialog} onOpenChange={setAddMergeDialog}><DialogContent className="max-w-[500px]">
        <DialogHeader><DialogTitle>추가 세부 병합 - 대상 선택</DialogTitle><DialogDescription>선택한 {selectedCount}개 미세부병합 클러스터를 추가할 세부 병합 클러스터를 선택하세요.</DialogDescription></DialogHeader>
        <div className="max-h-[400px] overflow-auto space-y-1">
          {mergedClusters.map(c => (
            <div key={c.clusterNumber} className="flex items-center justify-between p-2 border rounded hover:bg-blue-50 cursor-pointer" onClick={() => handleAddToMerged(c.clusterNumber)}>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-1 text-sm"><Badge variant="outline" className="text-[10px] font-mono">#{c.clusterNumber}</Badge><span className="truncate font-medium">{c.clusterName}</span></div><div className="text-xs text-muted-foreground mt-0.5">{c.childCount}개 하위 | Count: {(c.count||0).toLocaleString()} | {formatAmount(c.totalAmount||0)}</div></div>
              <Plus className="h-4 w-4 text-blue-600 flex-shrink-0 ml-2" />
            </div>
          ))}
          {mergedClusters.length === 0 && <div className="text-center text-xs text-muted-foreground py-8">세부 병합 클러스터가 없습니다</div>}
        </div>
      </DialogContent></Dialog>

      {/* 이름 변경 다이얼로그 */}
      <Dialog open={renameDialog.open} onOpenChange={o => setRenameDialog({ ...renameDialog, open: o })}><DialogContent>
        <DialogHeader><DialogTitle>클러스터 이름 변경</DialogTitle><DialogDescription>클러스터 #{renameDialog.cluster?.clusterNumber}의 새 이름을 입력하세요.</DialogDescription></DialogHeader>
        <Input placeholder="클러스터 이름" value={newClusterName} onChange={e => setNewClusterName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename()} />
        <div className="flex justify-end gap-2 mt-2"><Button variant="outline" onClick={() => setRenameDialog({ open: false, cluster: null })}>취소</Button><Button onClick={handleRename}>변경</Button></div>
      </DialogContent></Dialog>

      {/* 상세 다이얼로그 */}
      <Dialog open={detailDialog.open} onOpenChange={o => { setDetailDialog({ ...detailDialog, open: o }); if (!o) { setDetailChecked(new Set()); setDetailDragging(false); } }}>
        <DialogContent className="max-w-[900px] max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>세부 병합 상세: #{detailDialog.cluster?.clusterNumber} {truncateName(detailDialog.cluster?.clusterName)}</DialogTitle><DialogDescription>드래그 또는 Ctrl+클릭으로 복수 선택 가능</DialogDescription></DialogHeader>
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-md border mb-2 text-sm">
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Row Data:</span><Badge variant="secondary">{(detailDialog.cluster?.count || 0).toLocaleString()}건</Badge></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">하위 클러스터:</span><Badge variant="secondary">{(detailDialog.cluster?.childCount || 0).toLocaleString()}개</Badge></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">합산 금액:</span><Badge variant="secondary">{formatAmount(detailDialog.cluster?.totalAmount || 0)} {amountUnit}</Badge></div>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Button size="sm" variant="destructive" onClick={handlePartialUnmerge} disabled={detailChecked.size === 0}><Trash2 className="h-3 w-3 mr-1" />선택 항목 세부 병합 해제 ({detailChecked.size})</Button>
            <span className="text-xs text-muted-foreground ml-2">{detailChecked.size > 0 && `${detailChecked.size}개 선택됨`}</span>
          </div>
          <div className="border rounded-md" style={{ height: 'calc(80vh - 220px)', minHeight: '200px' }}>
            <AdvancedTable columns={detailColumns} data={detailDialog.cluster?.children || []} rowKey={r => r.clusterNumber} emptyMessage="하위 클러스터가 없습니다." rowClassName={r => detailChecked.has(r.clusterNumber) ? 'bg-blue-50' : ''} onRowMouseDown={handleDetailRowMouseDown} onRowMouseEnter={handleDetailRowMouseEnter} maxHeight="100%" />
          </div>
        </DialogContent>
      </Dialog>

      {/* 키워드 계층 자세히 다이얼로그 */}
      <Dialog open={keywordHierarchyDialog.open} onOpenChange={o => { setKeywordHierarchyDialog({ ...keywordHierarchyDialog, open: o }); if (!o) setNewKeywordInput({ level: 0, parentId: null, value: '' }); }}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader><DialogTitle>{keywordHierarchyDialog.level === 2 ? 'Lv2' : 'Lv3'} 키워드 관리: {keywordHierarchyDialog.parentKeyword}</DialogTitle><DialogDescription>하위 키워드를 추가하거나 삭제할 수 있습니다.</DialogDescription></DialogHeader>
          <div className="flex items-center gap-2 mb-4">
            <Input className="h-8 text-sm flex-1" placeholder={`새 ${keywordHierarchyDialog.level === 2 ? 'Lv2' : 'Lv3'} 키워드 입력...`} value={newKeywordInput.level === keywordHierarchyDialog.level && newKeywordInput.parentId === keywordHierarchyDialog.parentId ? newKeywordInput.value : ''} onChange={e => setNewKeywordInput({ level: keywordHierarchyDialog.level, parentId: keywordHierarchyDialog.parentId, value: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') handleAddKeyword(keywordHierarchyDialog.level, keywordHierarchyDialog.parentId, newKeywordInput.value); }} />
            <Button size="sm" className="h-8" onClick={() => handleAddKeyword(keywordHierarchyDialog.level, keywordHierarchyDialog.parentId, newKeywordInput.value)}><Plus className="h-3 w-3 mr-1" />추가</Button>
          </div>
          <div className="max-h-[300px] overflow-y-auto border rounded p-2 space-y-1">
            {(() => {
              let children = [];
              if (keywordHierarchyDialog.level === 2) { const parent = keywordHierarchy.find(lv1 => lv1.id === keywordHierarchyDialog.parentId); children = parent?.children || []; }
              else if (keywordHierarchyDialog.level === 3) { for (const lv1 of keywordHierarchy) { const lv2 = (lv1.children || []).find(c => c.id === keywordHierarchyDialog.parentId); if (lv2) { children = lv2.children || []; break; } } }
              if (children.length === 0) return <div className="text-center text-xs text-muted-foreground py-4">하위 키워드가 없습니다</div>;
              return children.map(child => (
                <div key={child.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 text-sm">
                  {keywordHierarchyDialog.level === 2 ? <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" /> : <Tag className="h-4 w-4 text-green-500 flex-shrink-0" />}
                  <span className="flex-1 cursor-pointer hover:text-blue-600 hover:underline" onClick={() => handleKeywordHierarchySearch(child.keyword)}>{child.keyword}</span>
                  {keywordHierarchyDialog.level === 2 && <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-blue-600" onClick={() => setKeywordHierarchyDialog({ open: true, parentId: child.id, parentKeyword: child.keyword, level: 3 })}>Lv3</Button>}
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDeleteKeyword(child.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DetailClusteringPage;
