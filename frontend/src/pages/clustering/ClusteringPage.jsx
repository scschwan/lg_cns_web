import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Home, GitMerge, Eye, Edit2, Trash2, Plus,
  Loader2, Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown,
  X, Folder, FolderOpen, Tag, Lock,
} from 'lucide-react';
import { useSessionEditorLock } from '../../hooks/useSessionEditorLock';
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import AdvancedTable from '@/components/AdvancedTable';
import clusteringService from '@/services/clusteringService';
import uploadService from '@/services/uploadService';
import useViewerMode from '../../hooks/useViewerMode';

/* ============================================================
   클러스터명 30자 제한 유틸
   ============================================================ */
const truncateName = (name, maxLen = 30) => {
  if (!name) return '';
  return name.length > maxLen ? name.slice(0, maxLen) + '...' : name;
};

/* ============================================================
   병합 진행률 오버레이 (독립 컴포넌트 — 리렌더 격리)
   ============================================================ */
function MergeProgressOverlay({ visible, progressRef, messageRef }) {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => forceUpdate(v => v + 1), 200);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;
  const progress = progressRef.current;
  const message = messageRef.current;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-[480px] flex flex-col items-center gap-5">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <div className="text-lg font-semibold text-gray-800">클러스터 병합 진행 중</div>
        <div className="w-full"><Progress value={progress} className="h-4" /></div>
        <div className="flex items-center justify-between w-full text-sm">
          <span className="text-muted-foreground">{message || '서버에서 병합 작업이 진행 중입니다...'}</span>
          <span className="font-mono font-bold text-blue-600">{progress}%</span>
        </div>
        <p className="text-xs text-muted-foreground text-center">병합이 완료될 때까지 페이지를 닫지 마세요.</p>
      </div>
    </div>
  );
}

/* ============================================================
   병합 결과 행 (React.memo — 자신의 props만 변경 시 리렌더)
   ============================================================ */
const MergedClusterRow = React.memo(function MergedClusterRow({
  cluster, isSelected, isMerging, isUnmerging, isViewer,
  onSelect, onDetail, onRename, onUnmerge, formatAmount, amountUnit,
}) {
  const isProcessing = cluster.mergeStatus === 'PROCESSING';
  const isBusy = isMerging || isUnmerging || isProcessing;
  return (
    <div
      className={`grid grid-cols-[28px_1fr_60px_90px_60px] gap-1 items-center px-2 py-1.5 border-b transition-colors
        ${isProcessing ? 'bg-amber-50 opacity-80' : isMerging ? 'bg-yellow-50 opacity-70' : isUnmerging ? 'bg-red-50 opacity-70' : isSelected ? 'bg-blue-50' : 'hover:bg-muted/50'}`}>
      <Checkbox
        checked={isSelected}
        disabled={isBusy || isViewer}
        onCheckedChange={ch => onSelect(cluster.clusterNumber, ch)} />
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[9px] font-mono flex-shrink-0">#{cluster.clusterNumber}</Badge>
          <span className="truncate" title={cluster.clusterName}>
            {isProcessing ? <span className="text-amber-600 font-semibold flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin inline" />처리중...</span>
              : isMerging ? <span className="text-yellow-600 font-semibold">병합중...</span>
              : isUnmerging ? <span className="text-red-600 font-semibold">해제중...</span>
              : truncateName(cluster.clusterName)}
          </span>
        </div>
      </div>
      <div className="text-right tabular-nums">{(cluster.count||0).toLocaleString()}</div>
      <div className="text-right tabular-nums">{formatAmount(cluster.totalAmount||0)}</div>
      <div className="flex items-center justify-center gap-0.5">
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onDetail(cluster)} title="상세" disabled={isBusy}><Eye className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onRename(cluster)} title="이름변경" disabled={isBusy || isViewer}><Edit2 className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => onUnmerge(cluster.clusterNumber)} title="병합해제" disabled={isBusy || isViewer}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
});

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
  const { isEditor, editorInfo } = useSessionEditorLock(projectId, sessionId);
  const { isViewer } = useViewerMode(projectId);
  const navigate = useNavigate();

  /* ----- 상태 ----- */
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const mergingProgressRef = useRef(0); // 병합 진행률 (0~100) — useRef로 리렌더 방지
  const mergingMessageRef = useRef(''); // 병합 진행 메시지 — useRef로 리렌더 방지
  const [mergingClusters, setMergingClusters] = useState(new Set()); // 현재 병합 중인 클러스터 번호들
  const [mergeOverlay, setMergeOverlay] = useState(false); // 대량 병합 시 풀스크린 오버레이
  const [mergeActiveBlocking, setMergeActiveBlocking] = useState(false); // ★ 서버에서 병합 진행 중 차단
  const [unmerging, setUnmerging] = useState(false); // 해제 진행 중
  const [unmergingProgress, setUnmergingProgress] = useState(0); // 해제 진행률
  const [autoMergeConfirm, setAutoMergeConfirm] = useState(null); // { type: 'keyword'|'supplier', items: [] }
  const [unmergingClusters, setUnmergingClusters] = useState(new Set()); // 현재 해제 중인 클러스터 번호들
  const [statistics, setStatistics] = useState({ totalRows: 0, unmergedCount: 0, unmergedTotalAmount: 0, mergedGroupCount: 0, hasSupplier: false });
  const [amountUnit, setAmountUnit] = useState('원');
  const divisor = { '원': 1, '천원': 1000, '백만원': 1000000, '억원': 100000000 };

  /* 고급 검색 */
  const [searchableColumns, setSearchableColumns] = useState([]);
  const [searchColumn, setSearchColumn] = useState('keyword');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [exactMatch, setExactMatch] = useState(false);
  const [excludeKeyword, setExcludeKeyword] = useState('');
  const [excludeExactMatch, setExcludeExactMatch] = useState(false);
  const [searchWithinResults, setSearchWithinResults] = useState(false);
  const [previousResultIds, setPreviousResultIds] = useState(null); // 결과내 재검색용
  const [searchCollapsed, setSearchCollapsed] = useState(false); // 검색 탭 접기/펼치기
  const [appliedSearchParams, setAppliedSearchParams] = useState(null); // 현재 적용된 검색 조건
  const [searchTabMode, setSearchTabMode] = useState('basic'); // 'basic' | 'keyword-hierarchy'

  /* 키워드 계층 (Lv1/Lv2/Lv3) */
  const [keywordHierarchy, setKeywordHierarchy] = useState([]);
  const [kwHierarchyLoading, setKwHierarchyLoading] = useState(false);
  const [expandedLv1, setExpandedLv1] = useState(new Set());
  const [expandedLv2, setExpandedLv2] = useState(new Set());
  const [newKeywordInput, setNewKeywordInput] = useState({ level: 0, parentId: null, value: '' });
  const [keywordHierarchyDialog, setKeywordHierarchyDialog] = useState({ open: false, parentId: null, parentKeyword: '', level: 2 });

  /* 미병합 테이블 */
  const [clusterData, setClusterData] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [clusterPage, setClusterPage] = useState(0);
  const [clusterPageSize, setClusterPageSize] = useState(20);
  const [clusterTotalCount, setClusterTotalCount] = useState(0);
  const [clusterTotalPages, setClusterTotalPages] = useState(0);
  const [sort, setSort] = useState(null);

  // 클라이언트 사이드 정렬
  const sortedClusterData = useMemo(() => {
    if (!sort || !clusterData.length) return clusterData;
    const { field, direction } = sort;
    return [...clusterData].sort((a, b) => {
      const aVal = a[field], bVal = b[field];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return direction === 'asc' ? cmp : -cmp;
    });
  }, [clusterData, sort]);

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
  const [mergedLoading, setMergedLoading] = useState(false);
  const [selectedMerged, setSelectedMerged] = useState(new Set());
  const [mergedPage, setMergedPage] = useState(0);
  const MERGED_PAGE_SIZE = 20;

  /* 다이얼로그 */
  const [detailDialog, setDetailDialog] = useState({ open: false, cluster: null });
  const [detailChildren, setDetailChildren] = useState([]);
  const [detailVisibleCols, setDetailVisibleCols] = useState([]);
  const [detailPage, setDetailPage] = useState(0);
  const [detailPageSize] = useState(50);
  const [detailTotalCount, setDetailTotalCount] = useState(0);
  const [detailTotalPages, setDetailTotalPages] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailChecked, setDetailChecked] = useState(new Set());
  const [detailDragging, setDetailDragging] = useState(false);
  const detailDragStart = useRef(null);
  const detailDragAction = useRef(null);
  const [renameDialog, setRenameDialog] = useState({ open: false, cluster: null });
  const [newClusterName, setNewClusterName] = useState('');
  const [addMergeDialog, setAddMergeDialog] = useState(false);
  const [undefinedMergeDialog, setUndefinedMergeDialog] = useState(false);
  const [undefinedMerging, setUndefinedMerging] = useState(false);

  /* ----- 글로벌 mouse up ----- */
  useEffect(() => {
    const handler = () => { setIsDraggingRow(false); setKwDragging(false); setSupDragging(false); setDetailDragging(false); };
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
    setMergedLoading(true);
    try {
      const data = await clusteringService.getMergedClusters(projectId, sessionId);
      console.log('[loadMerged] 응답:', data, '개수:', Array.isArray(data) ? data.length : 'not array');
      setMergedClusters(data || []);
      setMergedPage(0);
    } catch (e) {
      console.error('[loadMerged] 에러:', e);
      setMergedClusters([]);
      setMergedPage(0);
    } finally {
      setMergedLoading(false);
    }
  }, [projectId, sessionId]);

  const loadSearchableColumns = useCallback(async () => {
    try {
      const cols = await clusteringService.getSearchableColumns(projectId, sessionId);
      setSearchableColumns(cols || []);
    } catch (e) { console.error(e); }
  }, [projectId, sessionId]);

  const loadKeywordHierarchy = useCallback(async () => {
    setKwHierarchyLoading(true);
    try {
      const hierarchy = await clusteringService.getKeywordHierarchy(projectId, sessionId);
      setKeywordHierarchy(hierarchy || []);
    } catch (e) { console.error(e); }
    finally { setKwHierarchyLoading(false); }
  }, [projectId, sessionId]);

  const loadAll = useCallback(async () => {
    // Phase 1: 핵심 데이터 (통계 + 미병합 목록)
    await Promise.all([loadStatistics(), loadUnmerged(0, clusterPageSize, null)]);
    // Phase 2: 보조 데이터 (DB 동시 쿼리 수 제한)
    await Promise.all([loadKwStats(), loadSupStats(), loadMerged(), loadSearchableColumns(), loadKeywordHierarchy()]);
  }, [loadStatistics, loadUnmerged, clusterPageSize, loadKwStats, loadSupStats, loadMerged, loadSearchableColumns, loadKeywordHierarchy]);

  const refreshAll = useCallback(async () => {
    // ★ 병합 후 페이지를 0으로 리셋하여 병합된 항목이 사라진 최신 데이터 표시
    setClusterPage(0);
    // Phase 1: 핵심 데이터 (검색 활성 시 advancedSearch 사용)
    const reloadUnmerged = async () => {
      if (appliedSearchParams) {
        setLoading(true);
        try {
          const params = {
            page: 0,
            size: clusterPageSize,
            searchColumn: appliedSearchParams.searchColumn,
            searchValue: appliedSearchParams.searchValue,
            exactMatch: appliedSearchParams.exactMatch,
            excludeValue: appliedSearchParams.excludeValue,
            excludeExactMatch: appliedSearchParams.excludeExactMatch,
            withinClusterNumbers: appliedSearchParams.isSearchWithin ? previousResultIds : null,
          };
          const r = await clusteringService.advancedSearch(projectId, sessionId, params);
          setClusterData(r.data || []);
          setVisibleColumns(r.columns || []);
          setClusterTotalCount(r.totalCount || 0);
          setClusterTotalPages(r.totalPages || 0);
        } catch (e) { console.error(e); } finally { setLoading(false); }
      } else {
        await loadUnmerged(0, clusterPageSize, null);
      }
    };
    await Promise.all([loadStatistics(), reloadUnmerged()]);
    // Phase 2: 보조 데이터 (병합 결과 포함 전부 await)
    await Promise.all([loadKwStats(), loadSupStats(), loadMerged()]);
  }, [loadStatistics, loadUnmerged, clusterPageSize, appliedSearchParams, previousResultIds, projectId, sessionId, loadKwStats, loadSupStats, loadMerged]);

  /* ★ loadAll ref로 항상 최신 함수 호출 보장 */
  const loadAllRef = useRef(loadAll);
  useEffect(() => { loadAllRef.current = loadAll; }, [loadAll]);
  useEffect(() => { loadAllRef.current(); }, [projectId, sessionId]);

  /* ★ 서버에서 활성 병합 작업이 있는지 확인 → 있으면 완료까지 대기 */
  const checkAndWaitMergeActive = useCallback(async () => {
    try {
      const res = await clusteringService.isMergeActive(projectId, sessionId);
      if (!res.active) { setMergeActiveBlocking(false); return false; }
      // 활성 병합 발견 → 차단 UI 표시 + 폴링
      setMergeActiveBlocking(true);
      mergingProgressRef.current = res.progress || 0;
      mergingMessageRef.current = res.message || '병합 진행 중...';
      const POLL = 2000;
      while (true) {
        await new Promise(r => setTimeout(r, POLL));
        const p = await clusteringService.isMergeActive(projectId, sessionId);
        if (!p.active) break;
        mergingProgressRef.current = p.progress || 0;
        mergingMessageRef.current = p.message || '병합 진행 중...';
      }
      setMergeActiveBlocking(false);
      mergingProgressRef.current = 0;
      mergingMessageRef.current = '';
      await refreshAll();
      return true;
    } catch { setMergeActiveBlocking(false); return false; }
  }, [projectId, sessionId, refreshAll]);

  useEffect(() => { checkAndWaitMergeActive(); }, [projectId, sessionId]); // eslint-disable-line

  /* ============================================================
     고급 검색
     ============================================================ */
  const handleAdvancedSearch = async (isSearchWithin = false) => {
    setLoading(true);
    setClusterPage(0);
    setSelectAllMode(false);
    setExceptions(new Set());

    try {
      const params = {
        page: 0,
        size: clusterPageSize,
        searchColumn,
        searchValue: searchKeyword.trim() || null,
        exactMatch,
        excludeValue: excludeKeyword.trim() || null,
        excludeExactMatch,
        withinClusterNumbers: isSearchWithin && previousResultIds ? previousResultIds : null,
      };

      const r = await clusteringService.advancedSearch(projectId, sessionId, params);
      setClusterData(r.data || []);
      setVisibleColumns(r.columns || []);
      setClusterTotalCount(r.totalCount || 0);
      setClusterTotalPages(r.totalPages || 0);

      // 결과 ID 저장 (다음 결과내 재검색용)
      if (r.resultClusterNumbers) {
        setPreviousResultIds(r.resultClusterNumbers);
      }

      // 적용된 검색 조건 저장
      setAppliedSearchParams({
        searchColumn,
        searchValue: searchKeyword.trim() || null,
        exactMatch,
        excludeValue: excludeKeyword.trim() || null,
        excludeExactMatch,
        isSearchWithin,
      });
    } catch (e) {
      console.error(e);
      alert('검색 실패: ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchWithinResults && previousResultIds) {
      handleAdvancedSearch(true);
    } else {
      handleAdvancedSearch(false);
    }
  };

  const handleClearSearch = () => {
    setSearchKeyword('');
    setExcludeKeyword('');
    setExactMatch(false);
    setExcludeExactMatch(false);
    setSearchWithinResults(false);
    setPreviousResultIds(null);
    setAppliedSearchParams(null);
    setClusterPage(0);
    setSelectAllMode(false);
    setExceptions(new Set());
    loadUnmerged(0, clusterPageSize, null);
  };

  /* 페이징 - 고급 검색 지원 */
  const handlePageChange = async (p) => {
    setClusterPage(p);
    if (appliedSearchParams) {
      setLoading(true);
      try {
        const params = {
          page: p,
          size: clusterPageSize,
          searchColumn: appliedSearchParams.searchColumn,
          searchValue: appliedSearchParams.searchValue,
          exactMatch: appliedSearchParams.exactMatch,
          excludeValue: appliedSearchParams.excludeValue,
          excludeExactMatch: appliedSearchParams.excludeExactMatch,
          withinClusterNumbers: appliedSearchParams.isSearchWithin ? previousResultIds : null,
        };
        const r = await clusteringService.advancedSearch(projectId, sessionId, params);
        setClusterData(r.data || []);
        setVisibleColumns(r.columns || []);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    } else {
      loadUnmerged(p, clusterPageSize, null);
    }
  };

  const handlePageSizeChange = async (s) => {
    setClusterPageSize(s);
    setClusterPage(0);
    if (appliedSearchParams) {
      setLoading(true);
      try {
        const params = {
          page: 0,
          size: s,
          searchColumn: appliedSearchParams.searchColumn,
          searchValue: appliedSearchParams.searchValue,
          exactMatch: appliedSearchParams.exactMatch,
          excludeValue: appliedSearchParams.excludeValue,
          excludeExactMatch: appliedSearchParams.excludeExactMatch,
          withinClusterNumbers: appliedSearchParams.isSearchWithin ? previousResultIds : null,
        };
        const r = await clusteringService.advancedSearch(projectId, sessionId, params);
        setClusterData(r.data || []);
        setVisibleColumns(r.columns || []);
        setClusterTotalCount(r.totalCount || 0);
        setClusterTotalPages(r.totalPages || 0);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    } else {
      loadUnmerged(0, s, null);
    }
  };

  /* 키워드 계층 검색 (Lv1/2/3 키워드 클릭 시) - 직접 값 사용으로 상태 비동기 문제 해결 */
  const handleKeywordHierarchySearch = async (keyword) => {
    // UI 상태 업데이트
    setSearchKeyword(keyword);
    setSearchColumn('keyword');
    setExactMatch(true);
    setExcludeKeyword('');
    setExcludeExactMatch(false);
    setSearchWithinResults(false);
    setPreviousResultIds(null);
    setClusterPage(0);
    setSelectAllMode(false);
    setExceptions(new Set());
    setSearchTabMode('basic');
    setSearchCollapsed(false);

    // 직접 값으로 검색 실행 (상태 의존 X)
    setLoading(true);
    try {
      const params = {
        page: 0,
        size: clusterPageSize,
        searchColumn: 'keyword',
        searchValue: keyword,
        exactMatch: true,
        excludeValue: null,
        excludeExactMatch: false,
        withinClusterNumbers: null,
      };
      const r = await clusteringService.advancedSearch(projectId, sessionId, params);
      setClusterData(r.data || []);
      setVisibleColumns(r.columns || []);
      setClusterTotalCount(r.totalCount || 0);
      setClusterTotalPages(r.totalPages || 0);
      if (r.resultClusterNumbers) {
        setPreviousResultIds(r.resultClusterNumbers);
      }
      setAppliedSearchParams({
        searchColumn: 'keyword',
        searchValue: keyword,
        exactMatch: true,
        excludeValue: null,
        excludeExactMatch: false,
        isSearchWithin: false,
      });
    } catch (e) {
      console.error(e);
      alert('검색 실패: ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  };

  /* 키워드 계층 CRUD */
  const handleAddKeyword = async (level, parentId, keyword) => {
    if (isViewer) return;
    if (!keyword.trim()) return;
    try {
      await clusteringService.addKeywordHierarchy(projectId, sessionId, level, parentId, keyword.trim());
      await loadKeywordHierarchy();
      setNewKeywordInput({ level: 0, parentId: null, value: '' });
    } catch (e) {
      alert('키워드 추가 실패: ' + (e.response?.data?.message || e.message));
    }
  };

  const handleDeleteKeyword = async (id) => {
    if (isViewer) return;
    if (!window.confirm('키워드를 삭제하시겠습니까? 하위 키워드도 함께 삭제됩니다.')) return;
    try {
      await clusteringService.deleteKeywordHierarchy(projectId, sessionId, id);
      await loadKeywordHierarchy();
    } catch (e) {
      alert('키워드 삭제 실패: ' + (e.response?.data?.message || e.message));
    }
  };

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
      let all;
      if (appliedSearchParams) {
        // 고급 검색이 적용된 경우
        all = await clusteringService.getAdvancedSearchClusterNumbers(projectId, sessionId, {
          searchColumn: appliedSearchParams.searchColumn,
          searchValue: appliedSearchParams.searchValue,
          exactMatch: appliedSearchParams.exactMatch,
          excludeValue: appliedSearchParams.excludeValue,
          excludeExactMatch: appliedSearchParams.excludeExactMatch,
          withinClusterNumbers: appliedSearchParams.isSearchWithin ? previousResultIds : null,
        });
      } else {
        all = await clusteringService.getAllUnmergedClusterNumbers(projectId, sessionId, null);
      }
      return all.filter(id => !exceptions.has(id));
    }
    return Array.from(exceptions);
  }, [selectAllMode, exceptions, projectId, sessionId, appliedSearchParams, previousResultIds]);

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
  /** 병렬 실행 제한 유틸: 최대 limit개 동시 실행 */
  const parallelLimit = async (tasks, limit) => {
    const results = [];
    const executing = new Set();
    for (const task of tasks) {
      const p = task().then(r => { executing.delete(p); return r; });
      executing.add(p);
      results.push(p);
      if (executing.size >= limit) await Promise.race(executing);
    }
    return Promise.all(results);
  };

  const BATCH_MERGE_THRESHOLD = 100;
  const BATCH_CHUNK_SIZE = 100;
  const BATCH_PARALLEL_LIMIT = 3;

  const handleMerge = async () => {
    if (isViewer) return;
    if (selectedCount < 1) { alert('1개 이상의 클러스터를 선택하세요.'); return; }
    if (!window.confirm(`선택한 ${selectedCount}개 클러스터를 병합하시겠습니까?`)) return;
    setMerging(true);
    mergingProgressRef.current = 0;
    mergingMessageRef.current = '병합 처리 중...';
    setMergeOverlay(true);
    try {
      if (selectAllMode) {
        // ★ selectAll: 검색 조건에 맞는 전체 clusterNumber 조회 후 병합
        mergingProgressRef.current = 5;
        mergingMessageRef.current = '선택 클러스터 조회 중...';
        const nums = await getSelectedClusterNumbers();

        if (nums.length === 0) {
          alert('병합할 클러스터가 없습니다.');
          return;
        }

        if (nums.length <= BATCH_MERGE_THRESHOLD) {
          mergingProgressRef.current = 10;
          mergingMessageRef.current = `${nums.length}개 클러스터 병합 중...`;
          await clusteringService.mergeClusters(projectId, sessionId, nums);
        } else {
          // 대량: 3-Phase 배치 병합
          mergingProgressRef.current = 3;
          mergingMessageRef.current = '병합 클러스터 생성 중...';
          const startRes = await clusteringService.mergeStart(projectId, sessionId);
          const mergedClusterNumber = startRes.mergedClusterNumber;
          mergingProgressRef.current = 5;

          const chunks = [];
          for (let i = 0; i < nums.length; i += BATCH_CHUNK_SIZE) {
            chunks.push(nums.slice(i, i + BATCH_CHUNK_SIZE));
          }
          mergingMessageRef.current = `배치 전송 중... (0/${chunks.length})`;

          let completedBatches = 0;
          const batchTasks = chunks.map((chunk) => () =>
            clusteringService.mergeBatch(projectId, sessionId, mergedClusterNumber, chunk)
              .then(r => {
                completedBatches++;
                const pct = 5 + Math.round((completedBatches / chunks.length) * 85);
                mergingProgressRef.current = pct;
                mergingMessageRef.current = `배치 전송 중... (${completedBatches}/${chunks.length})`;
                return r;
              })
          );
          await parallelLimit(batchTasks, BATCH_PARALLEL_LIMIT);

          mergingProgressRef.current = 92;
          mergingMessageRef.current = '병합 마무리 중...';
          await clusteringService.mergeFinalize(projectId, sessionId, mergedClusterNumber);
        }
      } else {
        const nums = Array.from(exceptions);

        if (nums.length <= BATCH_MERGE_THRESHOLD) {
          // ★ Branch 2: 개별 선택 — 동기 처리 (완료된 결과 직접 반환)
          await clusteringService.mergeClusters(projectId, sessionId, nums);
        } else {
          // ★ Branch 3: 대량 개별 선택 → 3-Phase 배치 병합

          // Phase 1: 빈 부모 생성
          mergingProgressRef.current = 3;
          mergingMessageRef.current = '병합 클러스터 생성 중...';
          const startRes = await clusteringService.mergeStart(projectId, sessionId);
          const mergedClusterNumber = startRes.mergedClusterNumber;
          mergingProgressRef.current = 5;

          // Phase 2: 배치 분할 + 병렬 전송
          const chunks = [];
          for (let i = 0; i < nums.length; i += BATCH_CHUNK_SIZE) {
            chunks.push(nums.slice(i, i + BATCH_CHUNK_SIZE));
          }
          mergingMessageRef.current = `배치 전송 중... (0/${chunks.length})`;

          let completedBatches = 0;
          const batchTasks = chunks.map((chunk, idx) => () =>
            clusteringService.mergeBatch(projectId, sessionId, mergedClusterNumber, chunk)
              .then(r => {
                completedBatches++;
                const pct = 5 + Math.round((completedBatches / chunks.length) * 85);
                mergingProgressRef.current = pct;
                mergingMessageRef.current = `배치 전송 중... (${completedBatches}/${chunks.length})`;
                return r;
              })
          );
          await parallelLimit(batchTasks, BATCH_PARALLEL_LIMIT);

          // Phase 3: 부모 재계산
          mergingProgressRef.current = 92;
          mergingMessageRef.current = '병합 마무리 중...';
          await clusteringService.mergeFinalize(projectId, sessionId, mergedClusterNumber);
        }
      }

      mergingProgressRef.current = 100;
      mergingMessageRef.current = '병합 완료';
      setSelectAllMode(false); setExceptions(new Set());
      await refreshAll();
    } catch (e) { alert('병합 실패: ' + (e.response?.data?.message || e.message)); } finally {
      setMerging(false);
      mergingProgressRef.current = 0;
      mergingMessageRef.current = '';
      setMergeOverlay(false);
    }
  };

  const handleAddToMerged = async (targetMergedNumber) => {
    if (isViewer) return;
    if (selectedCount === 0) return;
    setMerging(true); mergingProgressRef.current = 0; setMergingClusters(new Set([targetMergedNumber]));
    setMergeOverlay(true); mergingMessageRef.current = '추가 병합 요청 중...';
    try {
      mergingProgressRef.current = 10; mergingMessageRef.current = '선택 클러스터 조회 중...';
      const nums = await getSelectedClusterNumbers();
      mergingProgressRef.current = 30; mergingMessageRef.current = `${nums.length}개 클러스터 추가 병합 중...`;
      await clusteringService.addToMergedCluster(projectId, sessionId, targetMergedNumber, nums);
      mergingProgressRef.current = 80; mergingMessageRef.current = '데이터 갱신 중...';
      setSelectAllMode(false); setExceptions(new Set()); setAddMergeDialog(false);
      await refreshAll();
      mergingProgressRef.current = 100; mergingMessageRef.current = '추가 병합 완료';
      await new Promise(r => setTimeout(r, 500));
    } catch (e) { alert('추가 병합 실패: ' + (e.response?.data?.message || e.message)); } finally {
      setMerging(false); mergingProgressRef.current = 0; setMergingClusters(new Set()); setMergeOverlay(false); mergingMessageRef.current = '';
    }
  };

  /* ============================================================
     키워드 통계 → 자세히 (자동검색 - 완전일치) / 자동 클러스터링
     ============================================================ */
  const handleKwDetail = async (keyword) => {
    // 검색 설정 적용 후 자동 검색 실행
    setSearchColumn('keyword');
    setSearchKeyword(keyword);
    setExactMatch(true); // 완전일치 검색
    setExcludeKeyword('');
    setExcludeExactMatch(false);
    setSearchWithinResults(false);
    setPreviousResultIds(null);
    setClusterPage(0);
    setSelectAllMode(false);
    setExceptions(new Set());
    setSearchTabMode('basic');
    setSearchCollapsed(false); // 검색 탭 펼치기

    // 자동 검색 실행
    setLoading(true);
    try {
      const params = {
        page: 0,
        size: clusterPageSize,
        searchColumn: 'keyword',
        searchValue: keyword,
        exactMatch: true, // 완전일치
        excludeValue: null,
        excludeExactMatch: false,
        withinClusterNumbers: null,
      };
      const r = await clusteringService.advancedSearch(projectId, sessionId, params);
      setClusterData(r.data || []);
      setVisibleColumns(r.columns || []);
      setClusterTotalCount(r.totalCount || 0);
      setClusterTotalPages(r.totalPages || 0);
      if (r.resultClusterNumbers) {
        setPreviousResultIds(r.resultClusterNumbers);
      }
      setAppliedSearchParams({
        searchColumn: 'keyword',
        searchValue: keyword,
        exactMatch: true,
        excludeValue: null,
        excludeExactMatch: false,
        isSearchWithin: false,
      });
    } catch (e) {
      console.error(e);
      alert('검색 실패: ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSupDetail = async (supplier) => {
    // 공급업체 기준 검색 설정 적용 후 자동 검색 실행 (완전일치)
    setSearchColumn('supplier');
    setSearchKeyword(supplier);
    setExactMatch(true); // 완전일치 검색
    setExcludeKeyword('');
    setExcludeExactMatch(false);
    setSearchWithinResults(false);
    setPreviousResultIds(null);
    setClusterPage(0);
    setSelectAllMode(false);
    setExceptions(new Set());
    setSearchTabMode('basic');
    setSearchCollapsed(false); // 검색 탭 펼치기

    // 자동 검색 실행
    setLoading(true);
    try {
      const params = {
        page: 0,
        size: clusterPageSize,
        searchColumn: 'supplier',
        searchValue: supplier,
        exactMatch: true, // 완전일치
        excludeValue: null,
        excludeExactMatch: false,
        withinClusterNumbers: null,
      };
      const r = await clusteringService.advancedSearch(projectId, sessionId, params);
      setClusterData(r.data || []);
      setVisibleColumns(r.columns || []);
      setClusterTotalCount(r.totalCount || 0);
      setClusterTotalPages(r.totalPages || 0);
      if (r.resultClusterNumbers) {
        setPreviousResultIds(r.resultClusterNumbers);
      }
      setAppliedSearchParams({
        searchColumn: 'supplier',
        searchValue: supplier,
        exactMatch: true,
        excludeValue: null,
        excludeExactMatch: false,
        isSearchWithin: false,
      });
    } catch (e) {
      console.error(e);
      alert('검색 실패: ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAutoMergeByKeywords = async () => {
    if (isViewer) return;
    if (kwCheckedSet.size === 0) { alert('키워드를 선택해주세요.'); return; }
    setAutoMergeConfirm({ type: 'keyword', items: [...kwCheckedSet] });
  };

  const executeAutoMergeByKeywords = async () => {
    setAutoMergeConfirm(null);
    setMerging(true); setMergeOverlay(true); mergingProgressRef.current = 0;
    const total = kwCheckedSet.size; let done = 0;
    try {
      for (const keyword of kwCheckedSet) {
        mergingMessageRef.current = `키워드 병합 중... (${done + 1}/${total}): ${keyword}`;
        const ids = await clusteringService.getAllUnmergedClusterNumbers(projectId, sessionId, keyword);
        if (ids.length >= 1) await clusteringService.mergeClusters(projectId, sessionId, ids);
        done++;
        mergingProgressRef.current = Math.round((done / total * 80));
      }
      mergingProgressRef.current = 85; mergingMessageRef.current = '데이터 갱신 중...';
      setKwCheckedSet(new Set()); setSelectAllMode(false); setExceptions(new Set());
      await refreshAll();
      mergingProgressRef.current = 100; mergingMessageRef.current = '자동 병합 완료';
      await new Promise(r => setTimeout(r, 500));
    } catch (e) { alert('자동 클러스터링 실패: ' + (e.response?.data?.message || e.message)); } finally { setMerging(false); setMergeOverlay(false); mergingProgressRef.current = 0; mergingMessageRef.current = ''; }
  };

  const handleAutoMergeBySuppliers = async () => {
    if (isViewer) return;
    if (supCheckedSet.size === 0) { alert('공급업체를 선택해주세요.'); return; }
    setAutoMergeConfirm({ type: 'supplier', items: [...supCheckedSet] });
  };

  const executeAutoMergeBySuppliers = async () => {
    setAutoMergeConfirm(null);
    setMerging(true); setMergeOverlay(true); mergingProgressRef.current = 0;
    const total = supCheckedSet.size; let done = 0;
    try {
      for (const supplier of supCheckedSet) {
        mergingMessageRef.current = `공급업체 병합 중... (${done + 1}/${total}): ${supplier}`;
        const ids = await clusteringService.getAllUnmergedClusterNumbers(projectId, sessionId, null, supplier);
        if (ids.length >= 1) await clusteringService.mergeClusters(projectId, sessionId, ids);
        done++;
        mergingProgressRef.current = Math.round((done / total * 80));
      }
      mergingProgressRef.current = 85; mergingMessageRef.current = '데이터 갱신 중...';
      setSupCheckedSet(new Set()); setSelectAllMode(false); setExceptions(new Set());
      await refreshAll();
      mergingProgressRef.current = 100; mergingMessageRef.current = '자동 병합 완료';
      await new Promise(r => setTimeout(r, 500));
    } catch (e) { alert('자동 클러스터링 실패: ' + (e.response?.data?.message || e.message)); } finally { setMerging(false); setMergeOverlay(false); mergingProgressRef.current = 0; mergingMessageRef.current = ''; }
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
    if (isViewer) return;
    if (!window.confirm(`클러스터 #${cn}의 병합을 해제하시겠습니까?`)) return;
    setUnmergingClusters(prev => new Set(prev).add(cn));
    setMergeActiveBlocking(true); mergingProgressRef.current = 30; mergingMessageRef.current = `클러스터 #${cn} 병합 해제 중...`;
    try {
      await clusteringService.unmergeClusters(projectId, sessionId, cn);
      mergingProgressRef.current = 70; mergingMessageRef.current = '데이터 갱신 중...';
      setSelectedMerged(new Set()); await refreshAll();
      mergingProgressRef.current = 100; mergingMessageRef.current = '병합 해제 완료';
      await new Promise(r => setTimeout(r, 500));
    } catch (e) { alert('병합 해제 실패: ' + (e.response?.data?.message || e.message)); }
    finally { setUnmergingClusters(prev => { const n = new Set(prev); n.delete(cn); return n; }); setMergeActiveBlocking(false); mergingProgressRef.current = 0; mergingMessageRef.current = ''; }
  };

  const handleBulkUnmerge = async () => {
    if (isViewer) return;
    if (selectedMerged.size === 0) return;
    if (!window.confirm(`${selectedMerged.size}개 병합 클러스터를 해제하시겠습니까?`)) return;
    setUnmerging(true); setUnmergingProgress(0); setUnmergingClusters(new Set(selectedMerged));
    setMergeOverlay(true); mergingProgressRef.current = 0; mergingMessageRef.current = '병합 해제 진행 중...';
    try {
      const total = selectedMerged.size; let done = 0;
      for (const cn of selectedMerged) {
        mergingMessageRef.current = `병합 해제 중... (${done + 1}/${total})`;
        await clusteringService.unmergeClusters(projectId, sessionId, cn);
        done++;
        setUnmergingProgress(Math.round((done / total) * 100));
        mergingProgressRef.current = Math.round((done / total * 80));
      }
      mergingProgressRef.current = 85; mergingMessageRef.current = '데이터 갱신 중...';
      await new Promise(r => setTimeout(r, 300)); setSelectedMerged(new Set()); await refreshAll();
      mergingProgressRef.current = 100; mergingMessageRef.current = '병합 해제 완료';
      await new Promise(r => setTimeout(r, 500));
    } catch (e) { alert('병합 해제 실패: ' + (e.response?.data?.message || e.message)); }
    finally { setUnmerging(false); setUnmergingProgress(0); setUnmergingClusters(new Set()); setMergeOverlay(false); mergingProgressRef.current = 0; mergingMessageRef.current = ''; }
  };

  const handleMergeMerged = async () => {
    if (isViewer) return;
    if (selectedMerged.size < 1) { alert('병합 클러스터를 선택하세요.'); return; }
    if (!window.confirm(`${selectedMerged.size}개 병합 클러스터를 하나로 합치시겠습니까?`)) return;
    setMerging(true); setMergingClusters(new Set(selectedMerged)); mergingProgressRef.current = 0;
    setMergeOverlay(true); mergingMessageRef.current = '병합 클러스터 합치는 중...';
    try {
      mergingProgressRef.current = 30; mergingMessageRef.current = `${selectedMerged.size}개 클러스터 합치는 중...`;
      await clusteringService.mergeMergedClusters(projectId, sessionId, Array.from(selectedMerged));
      mergingProgressRef.current = 80; mergingMessageRef.current = '데이터 갱신 중...';
      setSelectedMerged(new Set()); await refreshAll();
      mergingProgressRef.current = 100; mergingMessageRef.current = '병합 완료';
      await new Promise(r => setTimeout(r, 500));
    } catch (e) { alert('병합 실패: ' + (e.response?.data?.message || e.message)); }
    finally { setMerging(false); setMergingClusters(new Set()); mergingProgressRef.current = 0; setMergeOverlay(false); mergingMessageRef.current = ''; }
  };

  /* ============================================================
     병합 상세 다이얼로그 - 부분 해제 + 드래그 선택
     ============================================================ */
  const loadDetailChildren = useCallback(async (clusterNumber, page) => {
    setDetailLoading(true);
    try {
      const data = await clusteringService.getMergedClusterChildren(projectId, sessionId, clusterNumber, page, detailPageSize);
      setDetailChildren(data.children || []);
      setDetailVisibleCols(data.columns || []);
      setDetailTotalCount(data.totalCount || 0);
      setDetailTotalPages(data.totalPages || 0);
      setDetailPage(page);
    } catch (e) {
      console.error('[loadDetailChildren] 에러:', e);
      setDetailChildren([]);
      const msg = e.message || '';
      if (msg.includes('타임아웃') || msg.includes('시간이 초과')) {
        alert('데이터 조회 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setDetailLoading(false);
    }
  }, [projectId, sessionId, detailPageSize]);

  const handleOpenDetail = (cluster) => {
    setDetailDialog({ open: true, cluster });
    setDetailChecked(new Set());
    setDetailDragging(false);
    detailDragStart.current = null;
    detailDragAction.current = null;
    loadDetailChildren(cluster.clusterNumber, 0);
  };

  const handleDetailRowMouseDown = useCallback((row, idx, e) => {
    if (e.button !== 0) return;
    if (e.target.closest('[role="checkbox"]')) return;
    e.preventDefault();
    const cn = row.clusterNumber;
    if (e.ctrlKey || e.metaKey) {
      setDetailChecked(prev => {
        const next = new Set(prev);
        next.has(cn) ? next.delete(cn) : next.add(cn);
        return next;
      });
      return;
    }
    setDetailDragging(true);
    const currentlyChecked = detailChecked.has(cn);
    detailDragAction.current = currentlyChecked ? 'uncheck' : 'check';
    detailDragStart.current = idx;
    setDetailChecked(prev => {
      const next = new Set(prev);
      currentlyChecked ? next.delete(cn) : next.add(cn);
      return next;
    });
  }, [detailChecked]);

  const handleDetailRowMouseEnter = useCallback((row, idx, e) => {
    if (!detailDragging || detailDragStart.current === null) return;
    const lo = Math.min(detailDragStart.current, idx);
    const hi = Math.max(detailDragStart.current, idx);
    const action = detailDragAction.current;
    setDetailChecked(prev => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) {
        const cn = detailChildren[i]?.clusterNumber;
        if (cn == null) continue;
        action === 'check' ? next.add(cn) : next.delete(cn);
      }
      return next;
    });
  }, [detailDragging, detailChildren]);

  const handlePartialUnmerge = async () => {
    if (detailChecked.size === 0) { alert('해제할 항목을 선택하세요.'); return; }
    if (!window.confirm(`선택한 ${detailChecked.size}개 클러스터를 병합 해제하시겠습니까?`)) return;
    setMergeActiveBlocking(true); mergingProgressRef.current = 30; mergingMessageRef.current = '선택 항목 병합 해제 중...';
    try {
      await clusteringService.unmergePartialClusters(projectId, sessionId, detailDialog.cluster.clusterNumber, Array.from(detailChecked));
      mergingProgressRef.current = 70; mergingMessageRef.current = '데이터 갱신 중...';
      setDetailDialog({ open: false, cluster: null }); setDetailChecked(new Set());
      await refreshAll();
      mergingProgressRef.current = 100; mergingMessageRef.current = '부분 해제 완료';
      await new Promise(r => setTimeout(r, 500));
    } catch (e) { alert('부분 해제 실패: ' + (e.response?.data?.message || e.message)); }
    finally { setMergeActiveBlocking(false); mergingProgressRef.current = 0; mergingMessageRef.current = ''; }
  };

  /* 이름 변경 */
  const handleOpenRename = (c) => { setRenameDialog({ open: true, cluster: c }); setNewClusterName(c.clusterName); };

  // ★ F4: MergedClusterRow용 안정 콜백 (참조 동일성 유지)
  const handleMergedRowSelect = useCallback((clusterNumber, checked) => {
    setSelectedMerged(prev => { const n = new Set(prev); checked ? n.add(clusterNumber) : n.delete(clusterNumber); return n; });
  }, []);
  const handleRename = async () => {
    if (isViewer) return;
    if (!newClusterName.trim()) return;
    try {
      const cn = renameDialog.cluster.clusterNumber;
      const trimmedName = newClusterName.trim();
      await clusteringService.renameCluster(projectId, sessionId, cn, trimmedName);
      // 즉시 UI 반영 (optimistic update)
      setMergedClusters(prev => prev.map(c =>
        c.clusterNumber === cn ? { ...c, clusterName: trimmedName } : c
      ));
      setRenameDialog({ open: false, cluster: null });
      await refreshAll();
    } catch (e) { alert('이름 변경 실패: ' + (e.response?.data?.message || e.message)); }
  };

  /* 완료 */
  const handleComplete = async () => {
    if (isViewer) return;
    // 미병합 항목이 남아있는지 확인
    if (statistics.unmergedCount > 0) {
      setUndefinedMergeDialog(true);
      return;
    }
    try { await uploadService.updateStepHistory(projectId, sessionId, 6); } catch (e) { console.error(e); }
    navigate(`/projects/${projectId}/sessions/${sessionId}/export`);
  };

  const handleUndefinedMergeConfirm = async () => {
    if (isViewer) return;
    setUndefinedMerging(true);
    try {
      await clusteringService.autoMergeUndefined(projectId, sessionId);
      setUndefinedMergeDialog(false);
      try { await uploadService.updateStepHistory(projectId, sessionId, 6); } catch (e) { console.error(e); }
      navigate(`/projects/${projectId}/sessions/${sessionId}/export`);
    } catch (e) {
      alert('Undefined Cluster 일괄 병합 실패: ' + (e.response?.data?.message || e.message));
    } finally {
      setUndefinedMerging(false);
    }
  };

  const handleUndefinedMergeSkip = () => {
    setUndefinedMergeDialog(false);
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
            onCheckedChange={handleHeaderCheck}
            disabled={isViewer} />
        ),
        render: (row) => (
          <Checkbox checked={isRowChecked(row.clusterNumber)}
            onCheckedChange={c => handleRowCheck(row.clusterNumber, c)}
            disabled={isViewer} />
        ),
      },
      {
        key: 'clusterNumber', label: '클러스터번호', pinned: true, sortable: true, width: 110,
        render: r => <Badge variant="outline" className="text-[10px] font-mono">#{r.clusterNumber}</Badge>,
      },
      { key: 'clusterName', label: '클러스터명', sortable: true, minWidth: 150,
        render: r => <span className="whitespace-nowrap" title={r.clusterName}>{truncateName(r.clusterName)}</span>,
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
  }, [isHeaderChecked, isHeaderIndeterminate, selectAllMode, exceptions, visibleColumns, amountUnit, formatAmount, isViewer]);

  /* 상세 다이얼로그 컬럼 (체크박스 + 동적) */
  const detailColumns = useMemo(() => {
    const all = detailChildren.length;
    const isAllChecked = detailChecked.size === all && all > 0;
    const isIndeterminate = detailChecked.size > 0 && detailChecked.size < all;
    const cols = [
      {
        key: '_cb', label: '', pinned: true, sortable: false, resizable: false, width: 40,
        headerRender: () => (
          <Checkbox
            checked={isAllChecked}
            ref={el => { if (el) el.indeterminate = isIndeterminate; }}
            onCheckedChange={c => {
              if (c) setDetailChecked(new Set(detailChildren.map(ch => ch.clusterNumber)));
              else setDetailChecked(new Set());
            }}
            disabled={isViewer}
          />
        ),
        render: r => <Checkbox checked={detailChecked.has(r.clusterNumber)}
          onCheckedChange={c => setDetailChecked(prev => { const n = new Set(prev); c ? n.add(r.clusterNumber) : n.delete(r.clusterNumber); return n; })}
          disabled={isViewer} />,
      },
      { key: 'clusterNumber', label: '#', pinned: true, sortable: false, width: 70,
        render: r => <Badge variant="outline" className="text-[10px] font-mono">#{r.clusterNumber}</Badge> },
      { key: 'clusterName', label: '클러스터명', sortable: false, minWidth: 120,
        render: r => <span className="whitespace-nowrap">{truncateName(r.clusterName)}</span> },
      { key: 'keywords', label: '키워드', sortable: false, minWidth: 160,
        render: r => <div className="flex flex-wrap gap-0.5">{(r.keywords||[]).map((k,i)=><Badge key={i} variant="secondary" className="text-[9px]">{k}</Badge>)}</div> },
      { key: 'count', label: 'Count', sortable: false, width: 70, cellClassName: 'text-right', render: r => <span className="block text-right text-xs">{(r.count||0).toLocaleString()}</span> },
      { key: 'totalAmount', label: `금액(${amountUnit})`, sortable: false, width: 100, cellClassName: 'text-right', render: r => <span className="block text-right text-xs">{formatAmount(r.totalAmount||0)}</span> },
    ];
    for (const colName of detailVisibleCols) {
      cols.push({
        key: `rep_${colName}`, label: colName, sortable: false, minWidth: 80,
        render: r => { const v = r.representativeData?.[colName]; return <span className="text-xs whitespace-nowrap">{v != null ? String(v) : ''}</span>; },
      });
    }
    return cols;
  }, [detailChildren, detailVisibleCols, detailChecked, amountUnit, formatAmount, isViewer]);

  /* ============================================================
     렌더
     ============================================================ */
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* ★ 병합 진행 오버레이 (독립 컴포넌트 — 리렌더 격리) */}
      <MergeProgressOverlay
        visible={mergeOverlay || mergeActiveBlocking}
        progressRef={mergingProgressRef}
        messageRef={mergingMessageRef}
      />
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">

        {!isEditor && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">
                    뷰어 모드 - {editorInfo?.editorUserName || '다른 사용자'}님이 편집 중입니다
                </span>
            </div>
        )}

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
              <div className="flex items-center gap-6 text-sm flex-wrap">
                <span><span className="font-semibold">전체 행수:</span> <Badge variant="secondary">{(statistics.totalRows||0).toLocaleString()}</Badge></span>
                <span><span className="font-semibold">미병합 클러스터:</span> <Badge variant="secondary">{(statistics.unmergedCount||0).toLocaleString()}</Badge></span>
                <span><span className="font-semibold">미병합 합산:</span> <Badge variant="secondary">{formatAmount(statistics.unmergedTotalAmount||0)}</Badge></span>
                <span><span className="font-semibold">병합 그룹:</span> <Badge variant="secondary">{(statistics.mergedGroupCount||0).toLocaleString()}</Badge></span>
              </div>
            </CardContent>
          </Card>
        </div>

        {isViewer && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium mb-4">
            뷰어 권한: 조회만 가능합니다. 데이터 수정이 불가합니다.
          </div>
        )}

        {/* 메인 그리드 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* === 좌측 (8/12): 미병합 클러스터 === */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-3">

            {/* 고급 검색 섹션 (접기/펼치기 가능) */}
            <Card className="flex-shrink-0 shadow-sm">
              <CardHeader
                className="py-2 px-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setSearchCollapsed(!searchCollapsed)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    검색 설정
                    {appliedSearchParams && (
                      <Badge variant="secondary" className="text-[10px] ml-2">
                        검색 적용됨
                      </Badge>
                    )}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    {searchCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
              {!searchCollapsed && (
              <CardContent className="py-2 px-4 pt-0">
                {/* 검색 탭 헤더 */}
                <div className="flex items-center gap-2 mb-2 border-b pb-2">
                  <Button
                    variant={searchTabMode === 'basic' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => setSearchTabMode('basic')}
                  >
                    <Search className="h-3 w-3 mr-1" />검색 설정
                  </Button>
                  <Button
                    variant={searchTabMode === 'keyword-hierarchy' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => setSearchTabMode('keyword-hierarchy')}
                  >
                    <Folder className="h-3 w-3 mr-1" />추천 키워드
                  </Button>
                </div>

                {/* 검색 설정 탭 */}
                {searchTabMode === 'basic' && (
                  <div className="space-y-2">
                    {/* 1행: 검색 기준 + 검색어 + 완전일치 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={searchColumn} onValueChange={setSearchColumn}>
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue placeholder="검색 기준" />
                        </SelectTrigger>
                        <SelectContent>
                          {searchableColumns.map(col => (
                            <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8 text-sm flex-1 min-w-[150px]"
                        placeholder="검색 키워드 (AND: &, OR: , 구분)"
                        value={searchKeyword}
                        onChange={e => setSearchKeyword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      />
                      <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                        <Checkbox checked={exactMatch} onCheckedChange={setExactMatch} />
                        완전일치
                      </label>
                    </div>

                    {/* 2행: 제외 키워드 + 완전일치 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground w-[120px]">제외 키워드:</span>
                      <Input
                        className="h-8 text-sm flex-1 min-w-[150px]"
                        placeholder="제외 항목 (AND: &, OR: , 구분)"
                        value={excludeKeyword}
                        onChange={e => setExcludeKeyword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      />
                      <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                        <Checkbox checked={excludeExactMatch} onCheckedChange={setExcludeExactMatch} />
                        완전일치
                      </label>
                    </div>

                    {/* 3행: 결과내 재검색 + 버튼 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <Checkbox
                          checked={searchWithinResults}
                          onCheckedChange={setSearchWithinResults}
                          disabled={!previousResultIds || previousResultIds.length === 0}
                        />
                        결과 내 재검색
                      </label>
                      {previousResultIds && previousResultIds.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          (이전 결과: {previousResultIds.length.toLocaleString()}건)
                        </span>
                      )}
                      <div className="flex-1" />
                      <Button size="sm" className="h-8" onClick={handleSearch}>
                        <Search className="h-3 w-3 mr-1" />검색
                      </Button>
                      {appliedSearchParams && (
                        <Button size="sm" variant="outline" className="h-8" onClick={handleClearSearch}>
                          <X className="h-3 w-3 mr-1" />초기화
                        </Button>
                      )}
                    </div>

                    {/* 적용된 검색 조건 표시 */}
                    {appliedSearchParams && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                        <Badge variant="secondary" className="text-[10px]">
                          {searchableColumns.find(c => c.key === appliedSearchParams.searchColumn)?.label || appliedSearchParams.searchColumn}
                          {appliedSearchParams.exactMatch ? '=' : '~'}
                          "{appliedSearchParams.searchValue || ''}"
                        </Badge>
                        {appliedSearchParams.excludeValue && (
                          <Badge variant="outline" className="text-[10px] text-red-600">
                            제외: {appliedSearchParams.excludeExactMatch ? '=' : '~'}"{appliedSearchParams.excludeValue}"
                          </Badge>
                        )}
                        {appliedSearchParams.isSearchWithin && (
                          <Badge variant="outline" className="text-[10px] text-blue-600">결과내 재검색</Badge>
                        )}
                        <span className="text-muted-foreground">{clusterTotalCount.toLocaleString()}건</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 추천 키워드 (Lv1/Lv2/Lv3) 탭 */}
                {searchTabMode === 'keyword-hierarchy' && (
                  <div className="space-y-2">
                    {/* Lv1 추가 입력 */}
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-7 text-xs flex-1"
                        placeholder="새 Lv1 키워드 입력..."
                        value={newKeywordInput.level === 1 && !newKeywordInput.parentId ? newKeywordInput.value : ''}
                        onChange={e => setNewKeywordInput({ level: 1, parentId: null, value: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && handleAddKeyword(1, null, newKeywordInput.value)}
                        disabled={isViewer}
                      />
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleAddKeyword(1, null, newKeywordInput.value)} disabled={isViewer}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={loadKeywordHierarchy} disabled={kwHierarchyLoading}>
                        <RefreshCw className={`h-3 w-3 ${kwHierarchyLoading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>

                    {/* 키워드 계층 트리 */}
                    <div className="max-h-[200px] overflow-y-auto border rounded p-2 text-xs space-y-1">
                      {keywordHierarchy.length === 0 ? (
                        <div className="text-center text-muted-foreground py-4">등록된 추천 키워드가 없습니다</div>
                      ) : keywordHierarchy.map(lv1 => (
                        <div key={lv1.id} className="space-y-1">
                          {/* Lv1 */}
                          <div className="flex items-center gap-1 p-1 rounded hover:bg-gray-100">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => setExpandedLv1(prev => {
                                const next = new Set(prev);
                                next.has(lv1.id) ? next.delete(lv1.id) : next.add(lv1.id);
                                return next;
                              })}
                            >
                              {expandedLv1.has(lv1.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </Button>
                            <FolderOpen className="h-3 w-3 text-yellow-600" />
                            <span
                              className="flex-1 cursor-pointer hover:text-blue-600 hover:underline"
                              onClick={() => handleKeywordHierarchySearch(lv1.keyword)}
                            >
                              {lv1.keyword}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1 text-[10px] text-blue-600"
                              onClick={() => setKeywordHierarchyDialog({ open: true, parentId: lv1.id, parentKeyword: lv1.keyword, level: 2 })}
                            >
                              자세히
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 text-red-500"
                              onClick={() => handleDeleteKeyword(lv1.id)}
                              disabled={isViewer}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>

                          {/* Lv2 (펼쳐진 경우) */}
                          {expandedLv1.has(lv1.id) && lv1.children && lv1.children.length > 0 && (
                            <div className="ml-6 space-y-1">
                              {lv1.children.map(lv2 => (
                                <div key={lv2.id} className="space-y-1">
                                  <div className="flex items-center gap-1 p-1 rounded hover:bg-gray-50">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-4 w-4 p-0"
                                      onClick={() => setExpandedLv2(prev => {
                                        const next = new Set(prev);
                                        next.has(lv2.id) ? next.delete(lv2.id) : next.add(lv2.id);
                                        return next;
                                      })}
                                    >
                                      {lv2.children?.length > 0 ? (expandedLv2.has(lv2.id) ? <ChevronDown className="h-2 w-2" /> : <ChevronRight className="h-2 w-2" />) : <span className="w-2" />}
                                    </Button>
                                    <Folder className="h-3 w-3 text-blue-500" />
                                    <span
                                      className="flex-1 cursor-pointer hover:text-blue-600 hover:underline"
                                      onClick={() => handleKeywordHierarchySearch(lv2.keyword)}
                                    >
                                      {lv2.keyword}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-4 w-4 p-0 text-red-500"
                                      onClick={() => handleDeleteKeyword(lv2.id)}
                                      disabled={isViewer}
                                    >
                                      <X className="h-2 w-2" />
                                    </Button>
                                  </div>

                                  {/* Lv3 */}
                                  {expandedLv2.has(lv2.id) && lv2.children && lv2.children.length > 0 && (
                                    <div className="ml-5 space-y-0.5">
                                      {lv2.children.map(lv3 => (
                                        <div key={lv3.id} className="flex items-center gap-1 p-0.5 rounded hover:bg-gray-50">
                                          <Tag className="h-2 w-2 text-green-500" />
                                          <span
                                            className="flex-1 cursor-pointer hover:text-blue-600 hover:underline text-[10px]"
                                            onClick={() => handleKeywordHierarchySearch(lv3.keyword)}
                                          >
                                            {lv3.keyword}
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-4 w-4 p-0 text-red-500"
                                            onClick={() => handleDeleteKeyword(lv3.id)}
                                            disabled={isViewer}
                                          >
                                            <X className="h-2 w-2" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
              )}
            </Card>

            {/* 병합 액션 카드: 병합 + 추가병합 + 단위선택 */}
            <Card className="flex-shrink-0 shadow-sm">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 병합 버튼 with 프로그레스바 */}
                  <div className="relative">
                    <Button size="sm" className="h-8 min-w-[120px] relative overflow-hidden" onClick={handleMerge} disabled={selectedCount < 1 || merging || unmerging || isViewer}>
                      <span className="relative z-10 flex items-center">
                        {merging && mergingClusters.size === 0 ? (
                          <><Loader2 className="h-3 w-3 mr-1 animate-spin" />병합 중...</>
                        ) : (
                          <><GitMerge className="h-3 w-3 mr-1" />병합 ({selectedCount})</>
                        )}
                      </span>
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setAddMergeDialog(true)} disabled={selectedCount === 0 || mergedClusters.length === 0 || merging || unmerging || isViewer}>
                    <Plus className="h-3 w-3 mr-1" />추가 병합
                  </Button>

                  <div className="flex-1" />

                  {/* 단위 셀렉트 */}
                  <Select value={amountUnit} onValueChange={setAmountUnit}>
                    <SelectTrigger className="w-[80px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['원','천원','백만원','억원'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
                  data={sortedClusterData}
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

            {/* 키워드/공급업체 통계 (60%) */}
            <div className="flex flex-col" style={{ height: '60%', minHeight: '200px' }}>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <TabsList className={`grid w-full flex-shrink-0 ${statistics.hasSupplier ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <TabsTrigger value="keyword">키워드별</TabsTrigger>
                  {statistics.hasSupplier && <TabsTrigger value="supplier">공급업체별</TabsTrigger>}
                </TabsList>

                {/* 탭 콘텐츠 컨테이너 - 같은 위치에서 전환 */}
                <div className="flex-1 min-h-0 mt-2 relative">
                  {/* 키워드 탭 */}
                  <div className={`absolute inset-0 flex flex-col ${activeTab === 'keyword' ? '' : 'hidden'}`}>
                    <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      <CardHeader className="py-2 px-3 border-b flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-bold">키워드 통계 ({keywordStats.length}건)</CardTitle>
                          <div className="flex items-center gap-1">
                            {kwCheckedSet.size > 0 && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-red-600" onClick={() => setKwCheckedSet(new Set())}>
                                모두 해제
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={loadKwStats} disabled={kwLoading}>
                              <RefreshCw className={`h-3 w-3 ${kwLoading ? 'animate-spin' : ''}`} />
                            </Button>
                          </div>
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
                      onClick={handleAutoMergeByKeywords} disabled={kwCheckedSet.size === 0 || merging || isViewer}>
                      {merging && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      <GitMerge className="h-3 w-3 mr-1" />선택항목 자동 클러스터링 ({kwCheckedSet.size})
                    </Button>
                  </div>

                  {/* 공급업체 탭 */}
                  {statistics.hasSupplier && (
                    <div className={`absolute inset-0 flex flex-col ${activeTab === 'supplier' ? '' : 'hidden'}`}>
                      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <CardHeader className="py-2 px-3 border-b flex-shrink-0">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-bold">공급업체 통계 ({supplierStats.length}건)</CardTitle>
                            <div className="flex items-center gap-1">
                              {supCheckedSet.size > 0 && (
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-red-600" onClick={() => setSupCheckedSet(new Set())}>
                                  모두 해제
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={loadSupStats} disabled={supLoading}>
                                <RefreshCw className={`h-3 w-3 ${supLoading ? 'animate-spin' : ''}`} />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-auto">
                          <StatsListView items={sortedSupStats} checkedSet={supCheckedSet} onCheckedChange={setSupCheckedSet}
                            nameKey="supplier" nameLabel="공급업체" sortField={supSortField} sortDir={supSortDir} onSort={handleSupSort}
                            formatAmount={formatAmount} amountUnit={amountUnit} onDetail={handleSupDetail}
                            isDragging={supDragging} setIsDragging={setSupDragging} dragStartRef={supDragRef} />
                        </CardContent>
                      </Card>
                      <Button className="w-full mt-2 bg-purple-600 hover:bg-purple-700 h-8 text-sm font-semibold flex-shrink-0"
                        onClick={handleAutoMergeBySuppliers} disabled={supCheckedSet.size === 0 || merging || isViewer}>
                        {merging && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        <GitMerge className="h-3 w-3 mr-1" />선택항목 자동 클러스터링 ({supCheckedSet.size})
                      </Button>
                    </div>
                  )}
                </div>
              </Tabs>
            </div>

            {/* 병합결과 확인 (40%) */}
            <div className="flex flex-col mt-3" style={{ height: '40%', minHeight: '150px' }}>
              <Card className="flex-1 flex flex-col min-h-0 overflow-hidden shadow-sm">
                <CardHeader className="py-2 px-3 border-b flex-shrink-0">
                  <div className="flex items-center justify-between gap-1">
                    <CardTitle className="text-sm font-bold flex items-center gap-1">
                      병합 결과 ({mergedClusters.length})
                      {mergedLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {/* 병합 merge 버튼 with 프로그레스바 */}
                      <div className="relative">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs min-w-[120px] relative overflow-hidden"
                          onClick={handleMergeMerged} disabled={selectedMerged.size < 1 || merging || isViewer}>
                          <span className="relative z-10 flex items-center">
                            {merging && mergingClusters.size > 0 ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />병합 중...</>
                            ) : (
                              <><GitMerge className="h-3 w-3 mr-1" />병합 merge ({selectedMerged.size})</>
                            )}
                          </span>
                        </Button>
                      </div>
                      {/* 해제 버튼 with 프로그레스바 */}
                      <div className="relative">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 min-w-[100px] relative overflow-hidden"
                          onClick={handleBulkUnmerge} disabled={selectedMerged.size === 0 || merging || unmerging || isViewer}>
                          {unmerging && (
                            <div className="absolute inset-0 bg-red-100 transition-all" style={{ width: `${unmergingProgress}%` }} />
                          )}
                          <span className="relative z-10 flex items-center">
                            {unmerging ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{unmergingProgress}%</>
                            ) : (
                              <><Trash2 className="h-3 w-3 mr-1" />해제 ({selectedMerged.size})</>
                            )}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-auto">
                  {mergedLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">병합 결과 조회중...</span>
                    </div>
                  ) : mergedClusters.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">병합된 클러스터가 없습니다</div>
                  ) : (
                    <div className="text-xs">
                      {/* 헤더 */}
                      <div className="grid grid-cols-[28px_1fr_60px_90px_60px] gap-1 items-center px-2 py-2 border-b bg-gray-100 font-semibold text-muted-foreground sticky top-0 z-10">
                        <Checkbox
                          checked={selectedMerged.size === mergedClusters.length && mergedClusters.length > 0}
                          disabled={(merging && mergingClusters.size > 0) || isViewer}
                          onCheckedChange={c => {
                            if (c) setSelectedMerged(new Set(mergedClusters.map(m => m.clusterNumber)));
                            else setSelectedMerged(new Set());
                          }} />
                        <div>클러스터명</div>
                        <div className="text-right">Count</div>
                        <div className="text-right">금액({amountUnit})</div>
                        <div className="text-center">관리</div>
                      </div>
                      {mergedClusters
                        .slice(mergedPage * MERGED_PAGE_SIZE, (mergedPage + 1) * MERGED_PAGE_SIZE)
                        .map(c => (
                          <MergedClusterRow
                            key={c.clusterNumber}
                            cluster={c}
                            isSelected={selectedMerged.has(c.clusterNumber)}
                            isMerging={mergingClusters.has(c.clusterNumber)}
                            isUnmerging={unmergingClusters.has(c.clusterNumber)}
                            isViewer={isViewer}
                            onSelect={handleMergedRowSelect}
                            onDetail={handleOpenDetail}
                            onRename={handleOpenRename}
                            onUnmerge={handleUnmerge}
                            formatAmount={formatAmount}
                            amountUnit={amountUnit}
                          />
                        ))}
                      {/* 병합 결과 페이지네이션 */}
                      {mergedClusters.length > MERGED_PAGE_SIZE && (
                        <div className="flex items-center justify-between px-2 py-2 border-t text-xs sticky bottom-0 bg-white">
                          <span className="text-muted-foreground">
                            {mergedPage * MERGED_PAGE_SIZE + 1}-{Math.min((mergedPage + 1) * MERGED_PAGE_SIZE, mergedClusters.length)} / {mergedClusters.length}
                          </span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                              disabled={mergedPage === 0}
                              onClick={() => setMergedPage(p => p - 1)}>이전</Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                              disabled={(mergedPage + 1) * MERGED_PAGE_SIZE >= mergedClusters.length}
                              onClick={() => setMergedPage(p => p + 1)}>다음</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 완료 버튼 */}
              <Button className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold flex-shrink-0"
                onClick={handleComplete} disabled={isViewer}>
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
          <Input placeholder="클러스터 이름" value={newClusterName} onChange={e => setNewClusterName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename()} disabled={isViewer} />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setRenameDialog({ open: false, cluster: null })}>취소</Button>
            <Button onClick={handleRename} disabled={isViewer}>변경</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 상세 다이얼로그 (동적 컬럼 + 체크박스 + 부분 해제 + 드래그 선택) ===== */}
      <Dialog open={detailDialog.open} onOpenChange={o => {
        setDetailDialog({ ...detailDialog, open: o });
        if (!o) {
          setDetailChecked(new Set());
          setDetailDragging(false);
        }
      }}>
        <DialogContent
          className="flex flex-col"
          style={{
            width: '90vw', maxWidth: '1400px',
            height: '85vh', maxHeight: '90vh',
            minWidth: '600px', minHeight: '400px',
            resize: 'both', overflow: 'hidden',
          }}
        >
          <DialogHeader>
            <DialogTitle>
              병합 상세: #{detailDialog.cluster?.clusterNumber} {truncateName(detailDialog.cluster?.clusterName)}
            </DialogTitle>
            <DialogDescription>
              드래그 또는 Ctrl+클릭으로 복수 선택 가능 · 우측 하단 모서리를 드래그하여 크기 조절
            </DialogDescription>
          </DialogHeader>
          {/* 병합 클러스터 통계 정보 */}
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-md border mb-2 text-sm shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Row Data:</span>
              <Badge variant="secondary">{(detailDialog.cluster?.count || 0).toLocaleString()}건</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">하위 클러스터:</span>
              <Badge variant="secondary">{(detailDialog.cluster?.childCount || 0).toLocaleString()}개</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">합산 금액:</span>
              <Badge variant="secondary">{formatAmount(detailDialog.cluster?.totalAmount || 0)} {amountUnit}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-2 shrink-0">
            <Button size="sm" variant="destructive" onClick={handlePartialUnmerge} disabled={detailChecked.size === 0 || isViewer}>
              <Trash2 className="h-3 w-3 mr-1" />선택 항목 병합 해제 ({detailChecked.size})
            </Button>
            <span className="text-xs text-muted-foreground ml-2">
              {detailChecked.size > 0 && `${detailChecked.size}개 선택됨`}
            </span>
          </div>
          {/* 테이블 컨테이너 - flex-1로 남은 공간 전부 사용 */}
          <div className="border rounded-md flex-1 min-h-0">
            {detailLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">하위 클러스터 조회중...</span>
              </div>
            ) : (
              <AdvancedTable
                columns={detailColumns}
                data={detailChildren}
                rowKey={r => r.clusterNumber}
                emptyMessage="하위 클러스터가 없습니다."
                rowClassName={r => detailChecked.has(r.clusterNumber) ? 'bg-blue-50' : ''}
                onRowMouseDown={handleDetailRowMouseDown}
                onRowMouseEnter={handleDetailRowMouseEnter}
                maxHeight="100%"
              />
            )}
          </div>
          {/* 페이징 - 항상 표시 */}
          <div className="flex items-center justify-between pt-2 text-xs shrink-0">
            <span className="text-muted-foreground">
              총 {detailTotalCount.toLocaleString()}개
              {detailTotalCount > 0 && ` 중 ${detailPage * detailPageSize + 1}-${Math.min((detailPage + 1) * detailPageSize, detailTotalCount)}`}
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                disabled={detailPage === 0 || detailLoading}
                onClick={() => loadDetailChildren(detailDialog.cluster.clusterNumber, detailPage - 1)}>
                이전
              </Button>
              <span className="px-2">{detailPage + 1} / {Math.max(detailTotalPages, 1)}</span>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                disabled={detailPage >= detailTotalPages - 1 || detailLoading}
                onClick={() => loadDetailChildren(detailDialog.cluster.clusterNumber, detailPage + 1)}>
                다음
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 키워드 계층 자세히 다이얼로그 (Lv2/Lv3 관리) ===== */}
      <Dialog open={keywordHierarchyDialog.open} onOpenChange={o => {
        setKeywordHierarchyDialog({ ...keywordHierarchyDialog, open: o });
        if (!o) setNewKeywordInput({ level: 0, parentId: null, value: '' });
      }}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {keywordHierarchyDialog.level === 2 ? 'Lv2' : 'Lv3'} 키워드 관리: {keywordHierarchyDialog.parentKeyword}
            </DialogTitle>
            <DialogDescription>
              하위 키워드를 추가하거나 삭제할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          {/* 새 키워드 추가 */}
          <div className="flex items-center gap-2 mb-4">
            <Input
              className="h-8 text-sm flex-1"
              placeholder={`새 ${keywordHierarchyDialog.level === 2 ? 'Lv2' : 'Lv3'} 키워드 입력...`}
              value={newKeywordInput.level === keywordHierarchyDialog.level && newKeywordInput.parentId === keywordHierarchyDialog.parentId ? newKeywordInput.value : ''}
              onChange={e => setNewKeywordInput({ level: keywordHierarchyDialog.level, parentId: keywordHierarchyDialog.parentId, value: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleAddKeyword(keywordHierarchyDialog.level, keywordHierarchyDialog.parentId, newKeywordInput.value);
                }
              }}
              disabled={isViewer}
            />
            <Button
              size="sm"
              className="h-8"
              onClick={() => handleAddKeyword(keywordHierarchyDialog.level, keywordHierarchyDialog.parentId, newKeywordInput.value)}
              disabled={isViewer}
            >
              <Plus className="h-3 w-3 mr-1" />추가
            </Button>
          </div>

          {/* 기존 키워드 목록 */}
          <div className="max-h-[300px] overflow-y-auto border rounded p-2 space-y-1">
            {(() => {
              // 현재 부모의 자식 키워드 찾기
              let children = [];
              if (keywordHierarchyDialog.level === 2) {
                const parent = keywordHierarchy.find(lv1 => lv1.id === keywordHierarchyDialog.parentId);
                children = parent?.children || [];
              } else if (keywordHierarchyDialog.level === 3) {
                for (const lv1 of keywordHierarchy) {
                  const lv2 = (lv1.children || []).find(c => c.id === keywordHierarchyDialog.parentId);
                  if (lv2) {
                    children = lv2.children || [];
                    break;
                  }
                }
              }

              if (children.length === 0) {
                return <div className="text-center text-xs text-muted-foreground py-4">하위 키워드가 없습니다</div>;
              }

              return children.map(child => (
                <div key={child.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 text-sm">
                  {keywordHierarchyDialog.level === 2 ? (
                    <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  ) : (
                    <Tag className="h-4 w-4 text-green-500 flex-shrink-0" />
                  )}
                  <span
                    className="flex-1 cursor-pointer hover:text-blue-600 hover:underline"
                    onClick={() => handleKeywordHierarchySearch(child.keyword)}
                  >
                    {child.keyword}
                  </span>
                  {keywordHierarchyDialog.level === 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-blue-600"
                      onClick={() => setKeywordHierarchyDialog({ open: true, parentId: child.id, parentKeyword: child.keyword, level: 3 })}
                    >
                      Lv3
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500"
                    onClick={() => handleDeleteKeyword(child.id)}
                    disabled={isViewer}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Undefined Cluster 일괄 병합 확인 다이얼로그 ===== */}
      <Dialog open={undefinedMergeDialog} onOpenChange={o => { if (!undefinedMerging) setUndefinedMergeDialog(o); }}>
        <DialogContent className="max-w-[450px]">
          <DialogHeader>
            <DialogTitle>미병합 항목 처리</DialogTitle>
            <DialogDescription>
              병합되지 않은 {statistics.unmergedCount}개 항목이 남아있습니다.
              Undefined Cluster로 일괄 병합하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={handleUndefinedMergeSkip} disabled={undefinedMerging}>
              취소
            </Button>
            <Button onClick={handleUndefinedMergeConfirm} disabled={undefinedMerging || isViewer}>
              {undefinedMerging ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />병합 중...</> : '일괄 병합'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 자동 병합 확인 다이얼로그 */}
      <Dialog open={!!autoMergeConfirm} onOpenChange={() => setAutoMergeConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {autoMergeConfirm?.type === 'keyword' ? '키워드' : '공급업체'} 자동 클러스터링 확인
            </DialogTitle>
            <DialogDescription>
              선택한 {autoMergeConfirm?.items?.length || 0}개 항목의 클러스터를 자동 병합합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto border rounded-md p-2 space-y-1">
            {autoMergeConfirm?.items?.map((item, idx) => (
              <div key={idx} className="text-sm px-2 py-1 bg-muted rounded">
                {item}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAutoMergeConfirm(null)}>취소</Button>
            <Button onClick={() => {
              if (autoMergeConfirm?.type === 'keyword') executeAutoMergeByKeywords();
              else executeAutoMergeBySuppliers();
            }}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClusteringPage;
