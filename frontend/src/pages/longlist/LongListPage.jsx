import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Database, Layers, GitBranch, Hash,
  DollarSign, Eye, BarChart3, Loader2, ArrowRight, Lock, FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import costReductionService from '../../services/costReductionService';
import { useEditorLock } from '../../hooks/useEditorLock';
import { useDashboardStatus } from '../../hooks/useDashboardStatus';
import RawDataModal from '../../components/costreduction/RawDataModal';
import useViewerMode from '../../hooks/useViewerMode';

/* ============================================================
   색상 팔레트
   ============================================================ */
const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
  '#e11d48', '#84cc16', '#a855f7', '#0ea5e9', '#d946ef',
];

/* ============================================================
   헬퍼 함수
   ============================================================ */
function getAllLeafIds(tree) {
  const ids = [];
  tree.forEach(node => {
    if (node.children?.length) {
      node.children.forEach(child => {
        if (child.children?.length) {
          child.children.forEach(sub => { if (sub.statisticsId) ids.push(sub.statisticsId); });
        } else if (child.statisticsId) {
          ids.push(child.statisticsId);
        }
      });
    }
  });
  return ids;
}

function getNodeId(node) {
  return node.statisticsId || node.id;
}

function getNodeName(node) {
  if (node.level === 1) return node.accountName;
  return node.clusterName || node.accountName || '(이름 없음)';
}

const formatAmount = (v) => {
  if (v == null) return '0';
  if (Math.abs(v) >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(0) + '만';
  return v.toLocaleString();
};

/* ============================================================
   Stat Card
   ============================================================ */
function StatCard({ icon: Icon, label, value, unit, color, onClick }) {
  return (
    <Card className={cn('flex-1 min-w-0', onClick && 'cursor-pointer hover:ring-2 hover:ring-blue-300 transition-shadow')} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-xl font-bold tabular-nums">
              {typeof value === 'number' ? value.toLocaleString() : value}
              {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================
   Tree Table Row (체크박스 포함 + 드래그/Ctrl 멀티셀렉트)
   ============================================================ */
function TreeRow({ item, level = 0, expandedIds, toggleExpand, checkedIds, onCheck, isReadOnly, onItemClick, onRawDataClick, cursorIds, onMouseDownRow, onMouseEnterRow, flatIndex }) {
  const hasChildren = item.children && item.children.length > 0;
  const nodeId = getNodeId(item);
  const isExpanded = expandedIds.has(nodeId);
  const paddingLeft = 16 + level * 24;

  const getChildLeafIds = (node) => {
    const ids = [];
    if (node.children?.length) {
      node.children.forEach(c => {
        if (c.children?.length) {
          c.children.forEach(sub => ids.push(getNodeId(sub)));
        } else {
          ids.push(getNodeId(c));
        }
      });
    }
    return ids;
  };

  const leafIds = hasChildren ? getChildLeafIds(item) : [nodeId];
  const isChecked = leafIds.every(id => checkedIds.has(id));
  const isIndeterminate = !isChecked && leafIds.some(id => checkedIds.has(id));
  const isCursor = cursorIds?.has(nodeId);

  const handleCheck = () => {
    if (isReadOnly) return;
    // 커서가 잡힌 상태에서 체크 토글 → leaf 노드만 커서 일괄 적용
    // 부모 노드(hasChildren)는 항상 leafIds 기반 토글 (cursor 모드여도 하위 일괄 처리)
    if (cursorIds && cursorIds.size > 0 && cursorIds.has(nodeId) && !hasChildren) {
      onCheck(prev => {
        const n = new Set(prev);
        const shouldCheck = !isChecked;
        cursorIds.forEach(cursorNodeId => {
          if (shouldCheck) n.add(cursorNodeId);
          else n.delete(cursorNodeId);
        });
        return n;
      });
      return;
    }
    // 부모 노드 또는 일반 클릭: leafIds 기반 토글
    if (isChecked) {
      onCheck(prev => { const n = new Set(prev); leafIds.forEach(id => n.delete(id)); return n; });
    } else {
      onCheck(prev => { const n = new Set(prev); leafIds.forEach(id => n.add(id)); return n; });
    }
  };

  const handleRowClick = (e) => {
    if (hasChildren) {
      toggleExpand(nodeId);
    }
    if (onItemClick && (item.statisticsId || item.accountName)) {
      onItemClick(item);
    }
  };

  const handleRowMouseDown = (e) => {
    if (onMouseDownRow) onMouseDownRow(e, nodeId, flatIndex);
  };

  const handleRowMouseEnter = () => {
    if (onMouseEnterRow) onMouseEnterRow(nodeId, flatIndex);
  };

  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer transition-colors select-none',
          level === 0 && 'bg-muted/30 font-medium',
          level > 0 && 'text-sm',
          leafIds.some(id => checkedIds.has(id)) && 'bg-blue-50',
          isCursor && 'ring-1 ring-inset ring-blue-300 bg-blue-100',
        )}
        onClick={handleRowClick}
        onMouseDown={handleRowMouseDown}
        onMouseEnter={handleRowMouseEnter}
      >
        <TableCell className="w-[40px] text-center py-2.5" onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={isIndeterminate ? 'indeterminate' : isChecked}
            onCheckedChange={handleCheck}
            disabled={isReadOnly}
            onMouseDown={e => e.stopPropagation()}
          />
        </TableCell>
        <TableCell style={{ paddingLeft: level > 0 ? paddingLeft : 8 }} className="py-2.5">
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </span>
            ) : <span className="w-4 h-4 flex-shrink-0" />}
            <span className={cn(level === 0 ? 'font-semibold' : 'text-foreground')}>{getNodeName(item)}</span>
            {level === 0 && hasChildren && <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">{item.children.length}</Badge>}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{(item.costCenterCount || 0).toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{(item.supplierCount || 0).toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5 font-medium">{formatAmount(item.totalAmount)}</TableCell>
        <TableCell className="text-center py-2.5 w-[80px]" onClick={e => e.stopPropagation()}>
          {(item.statisticsId || item.accountName) && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-50"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => onRawDataClick && onRawDataClick(item)}>
              <Eye className="w-3 h-3 mr-1" />조회
            </Button>
          )}
        </TableCell>
      </TableRow>
      {isExpanded && hasChildren && item.children.map(child => (
        <TreeRow key={getNodeId(child)} item={child} level={level + 1} expandedIds={expandedIds} toggleExpand={toggleExpand} checkedIds={checkedIds} onCheck={onCheck} isReadOnly={isReadOnly} onItemClick={onItemClick} onRawDataClick={onRawDataClick} cursorIds={cursorIds} onMouseDownRow={onMouseDownRow} onMouseEnterRow={onMouseEnterRow} flatIndex={flatIndex} />
      ))}
    </>
  );
}

/* ============================================================
   Detail Modal (금액 비율 자세히 보기)
   ============================================================ */
function RatioDetailModal({ open, onClose, title, data }) {
  const [hiddenItems, setHiddenItems] = useState(new Set());

  // 모달이 열릴 때 hidden 상태 초기화
  useEffect(() => {
    if (open) setHiddenItems(new Set());
  }, [open]);

  if (!data || data.length === 0) return null;

  const visibleData = data.filter((_, idx) => !hiddenItems.has(idx));
  const visibleTotal = visibleData.reduce((s, d) => s + (d.amount || 0), 0);

  const pieData = visibleData.map(d => ({
    ...d,
    ratio: visibleTotal > 0 ? +((d.amount || 0) / visibleTotal * 100).toFixed(1) : 0,
  }));

  const toggleItem = (idx) => {
    setHiddenItems(prev => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-600" />{title}
          </DialogTitle>
          <DialogDescription>선택된 항목의 금액 비율을 확인합니다. 하단 항목을 클릭하면 차트에서 숨기거나 표시할 수 있습니다.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center gap-6 py-4">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2} label={({ ratio }) => `${ratio}%`}>
                  {pieData.map((entry, idx) => {
                    const origIdx = data.findIndex(d => d.name === entry.name);
                    return <Cell key={idx} fill={CHART_COLORS[origIdx % CHART_COLORS.length]} />;
                  })}
                </Pie>
                <Tooltip formatter={(v) => formatAmount(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-full space-y-2 px-4">
              {data.map((item, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors hover:bg-muted/50',
                    hiddenItems.has(idx) && 'opacity-40 line-through'
                  )}
                  onClick={() => toggleItem(idx)}
                >
                  <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                  <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatAmount(item.amount)}</span>
                  <Badge variant="secondary" className="text-xs tabular-nums min-w-[50px] justify-center">
                    {hiddenItems.has(idx) ? '-' : (visibleTotal > 0 ? ((item.amount || 0) / visibleTotal * 100).toFixed(1) : 0) + '%'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onClose(false)}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Selected Item Stats Card
   ============================================================ */
function SelectedItemCard({ itemStats, itemName, onRawDataClick }) {
  if (!itemStats) return null;
  return (
    <div className="grid grid-cols-5 gap-3">
      <StatCard icon={FileSpreadsheet} label="Raw Data 행 수" value={itemStats.rawDataRows || 0} color="bg-blue-500" onClick={onRawDataClick} />
      <StatCard icon={Layers} label="공급업체 수" value={itemStats.supplierCount || 0} color="bg-purple-500" />
      <StatCard icon={GitBranch} label="코스트센터 수" value={itemStats.costCenterCount || 0} color="bg-green-500" />
      <StatCard icon={DollarSign} label="합계 금액" value={formatAmount(itemStats.totalAmount || 0)} color="bg-orange-500" />
      <StatCard icon={BarChart3} label="전체 대비 비율" value={itemStats.ratioToTotal || 0} unit="%" color="bg-rose-500" />
    </div>
  );
}

/* ============================================================
   메인 LongListPage
   ============================================================ */
export default function LongListPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { isEditor } = useEditorLock(projectId);
  const { dashboardStatus } = useDashboardStatus(projectId);
  const { isViewer } = useViewerMode(projectId);

  const [treeData, setTreeData] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [checkedIds, setCheckedIds] = useState(new Set());

  // 선택 항목 차트
  const [selectedItem, setSelectedItem] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [itemStats, setItemStats] = useState(null);
  const [chartTop, setChartTop] = useState(5);
  const [chartLoading, setChartLoading] = useState(false);

  // 모달
  const [ratioDetailModal, setRatioDetailModal] = useState({ open: false, title: '', data: null });
  const [rawDataModal, setRawDataModal] = useState({ open: false, title: '', fetchFn: null });
  const [shortListConfirmOpen, setShortListConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // 드래그/Ctrl 멀티셀렉트 상태
  const [cursorIds, setCursorIds] = useState(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(null);

  const isReadOnly = isViewer || !isEditor || dashboardStatus?.isListLocked;

  // 트리를 flat list로 변환 (현재 확장된 상태 기반)
  const flatNodeIds = useMemo(() => {
    const ids = [];
    const traverse = (nodes, expandedIds) => {
      nodes.forEach(node => {
        const nodeId = getNodeId(node);
        ids.push(nodeId);
        if (node.children?.length && expandedIds.has(nodeId)) {
          traverse(node.children, expandedIds);
        }
      });
    };
    traverse(treeData, expandedIds);
    return ids;
  }, [treeData, expandedIds]);

  const handleRowMouseDown = useCallback((e, nodeId, flatIdx) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setCursorIds(prev => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    const idx = flatNodeIds.indexOf(nodeId);
    dragStartRef.current = idx >= 0 ? idx : 0;
    setCursorIds(new Set([nodeId]));
  }, [flatNodeIds]);

  const handleRowMouseEnter = useCallback((nodeId, flatIdx) => {
    if (!isDragging || dragStartRef.current === null) return;
    const currentIdx = flatNodeIds.indexOf(nodeId);
    if (currentIdx < 0) return;
    const startIdx = dragStartRef.current;
    const minIdx = Math.min(startIdx, currentIdx);
    const maxIdx = Math.max(startIdx, currentIdx);
    const newSet = new Set();
    for (let i = minIdx; i <= maxIdx; i++) {
      newSet.add(flatNodeIds[i]);
    }
    setCursorIds(newSet);
  }, [isDragging, flatNodeIds]);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // 데이터 로드
  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [treeRes, statsRes, selectionsRes] = await Promise.all([
          costReductionService.getLongListTree(projectId),
          costReductionService.getLongListStats(projectId),
          costReductionService.getLongListSelections(projectId),
        ]);
        setTreeData(treeRes.tree || []);
        setStats(statsRes);

        // 기존 선택 항목 복원
        if (selectionsRes.items?.length > 0) {
          setCheckedIds(new Set(selectionsRes.items.map(i => i.statisticsId)));
        } else {
          // 최초: 전체 선택
          setCheckedIds(new Set(getAllLeafIds(treeRes.tree || [])));
        }

        // 첫 번째 계정명 펼치기
        if (treeRes.tree?.length > 0) {
          setExpandedIds(new Set([getNodeId(treeRes.tree[0])]));
        }
      } catch (err) {
        console.error('Failed to load long list data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  // 항목 클릭 → 차트 데이터 로드 (계정명/클러스터/세부클러스터 모두 지원)
  const handleItemClick = useCallback(async (item) => {
    if (!projectId) return;
    setSelectedItem(item);
    setChartLoading(true);
    try {
      let chartRes, itemStatsRes;
      if (item.statisticsId) {
        // 클러스터/세부클러스터 항목
        [chartRes, itemStatsRes] = await Promise.all([
          costReductionService.getLongListChart(projectId, item.statisticsId, chartTop),
          costReductionService.getLongListItemStats(projectId, item.statisticsId),
        ]);
      } else if (item.accountName) {
        // 계정명 항목 (level 1)
        [chartRes, itemStatsRes] = await Promise.all([
          costReductionService.getLongListAccountChart(projectId, item.accountName, chartTop),
          costReductionService.getLongListAccountItemStats(projectId, item.accountName),
        ]);
      } else {
        setChartLoading(false);
        return;
      }
      setChartData(chartRes);
      setItemStats(itemStatsRes);
    } catch (err) {
      console.error('Failed to load chart data:', err);
    } finally {
      setChartLoading(false);
    }
  }, [projectId, chartTop]);

  // Top N 변경 시 차트 재로드
  useEffect(() => {
    if (!selectedItem || !projectId) return;
    const reload = async () => {
      try {
        let chartRes;
        if (selectedItem.statisticsId) {
          chartRes = await costReductionService.getLongListChart(projectId, selectedItem.statisticsId, chartTop);
        } else if (selectedItem.accountName) {
          chartRes = await costReductionService.getLongListAccountChart(projectId, selectedItem.accountName, chartTop);
        }
        if (chartRes) setChartData(chartRes);
      } catch (err) {
        console.error('Failed to reload chart:', err);
      }
    };
    reload();
  }, [chartTop, selectedItem?.statisticsId, selectedItem?.accountName, projectId]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const expandAll = () => setExpandedIds(new Set(treeData.map(i => getNodeId(i))));
  const collapseAll = () => setExpandedIds(new Set());
  const selectAll = () => setCheckedIds(new Set(getAllLeafIds(treeData)));
  const deselectAll = () => setCheckedIds(new Set());

  /* -- Raw Data 모달 열기 -- */
  const handleOpenRawData = useCallback(() => {
    if (!selectedItem || !projectId) return;
    const itemName = getNodeName(selectedItem);
    let fetchFn;
    if (selectedItem.statisticsId) {
      fetchFn = (page, size) => costReductionService.getLongListRawData(projectId, selectedItem.statisticsId, page, size);
    } else if (selectedItem.accountName) {
      fetchFn = (page, size) => costReductionService.getLongListAccountRawData(projectId, selectedItem.accountName, page, size);
    }
    if (fetchFn) {
      setRawDataModal({ open: true, title: itemName, fetchFn });
    }
  }, [selectedItem, projectId]);

  /* -- Raw Data 모달 열기 (트리 행에서 직접 호출) -- */
  const handleRowRawDataClick = useCallback((item) => {
    if (!projectId) return;
    const itemName = getNodeName(item);
    let fetchFn;
    if (item.statisticsId) {
      fetchFn = (page, size) => costReductionService.getLongListRawData(projectId, item.statisticsId, page, size);
    } else if (item.accountName) {
      fetchFn = (page, size) => costReductionService.getLongListAccountRawData(projectId, item.accountName, page, size);
    }
    if (fetchFn) {
      setRawDataModal({ open: true, title: itemName, fetchFn });
    }
  }, [projectId]);

  /* -- 합계 -- */
  const totals = useMemo(() => treeData.reduce(
    (a, i) => ({
      costCenterCount: a.costCenterCount + (i.costCenterCount || 0),
      supplierCount: a.supplierCount + (i.supplierCount || 0),
      totalAmount: a.totalAmount + (i.totalAmount || 0),
    }),
    { costCenterCount: 0, supplierCount: 0, totalAmount: 0 }
  ), [treeData]);

  /* -- Short List 도출 (기존 Short List가 있으면 확인 다이얼로그 표시) -- */
  const handleDeriveShortListClick = async () => {
    if (!projectId || checkedIds.size === 0) return;
    try {
      const selectionsRes = await costReductionService.getShortListSelections(projectId);
      if (selectionsRes.items?.length > 0) {
        setShortListConfirmOpen(true);
      } else {
        handleDeriveShortListConfirmed();
      }
    } catch (err) {
      handleDeriveShortListConfirmed();
    }
  };

  const handleDeriveShortListConfirmed = async () => {
    setShortListConfirmOpen(false);
    if (!projectId || checkedIds.size === 0) return;
    setSaving(true);
    try {
      // ★ ID 목록만 전송 (WAF body size 제한 우회)
      // checkedIds에는 leaf 노드의 statisticsId만 들어있으므로
      // 부모 클러스터(Level 2)의 ID도 함께 수집해서 전송
      const allIds = collectAllStatisticsIds(treeData, checkedIds);
      await costReductionService.saveLongListSelectionsByIds(projectId, allIds);
      navigate(`/projects/${projectId}/shortlist`);
    } catch (err) {
      console.error('Failed to save selections:', err);
      if (err?.__CANCEL__ || err?.message === '세션이 만료되었습니다.') return;
      const isTimeout = err?.code === 'ECONNABORTED';
      const isInfra = err?.response?.status === 403 && !(err?.response?.data?.error);
      let msg;
      if (isTimeout) {
        msg = '서버 처리 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
      } else if (isInfra) {
        msg = '네트워크 또는 서버 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
      } else {
        msg = err?.response?.data?.message || err?.message || '알 수 없는 오류';
      }
      alert(`Long List 저장 중 오류가 발생했습니다: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  /* -- 차트 데이터 변환 (공급업체/코스트센터) - 내림차순 정렬, 0원은 하단 -- */
  const supplierChartData = useMemo(() => {
    if (!chartData?.supplierBreakdown) return [];
    const total = chartData.supplierBreakdown.reduce((s, i) => s + (i.totalAmount || 0), 0);
    return chartData.supplierBreakdown
      .map(i => ({
        name: i.name,
        amount: i.totalAmount || 0,
        count: i.count || 0,
        ratio: total > 0 ? +((i.totalAmount || 0) / total * 100).toFixed(1) : 0,
        금액: Math.round((i.totalAmount || 0) / 100000000 * 10) / 10,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [chartData]);

  const costCenterChartData = useMemo(() => {
    if (!chartData?.costCenterBreakdown) return [];
    const total = chartData.costCenterBreakdown.reduce((s, i) => s + (i.totalAmount || 0), 0);
    return chartData.costCenterBreakdown
      .map(i => ({
        name: i.name,
        amount: i.totalAmount || 0,
        count: i.count || 0,
        ratio: total > 0 ? +((i.totalAmount || 0) / total * 100).toFixed(1) : 0,
        금액: Math.round((i.totalAmount || 0) / 100000000 * 10) / 10,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [chartData]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">데이터 로딩 중...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Long List 도출</h1>
              {dashboardStatus?.isListLocked && <Badge variant="destructive" className="gap-1"><Lock className="w-3 h-3" />리스트 잠금</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              비용 유형별 분류 및 분석 결과를 확인합니다
              {(isViewer || !isEditor) && <Badge variant="outline" className="ml-2 text-orange-600 border-orange-300">뷰어 모드</Badge>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isReadOnly && checkedIds.size > 0 && (
              <Button onClick={handleDeriveShortListClick} disabled={saving} className="gap-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Long List 도출 ({checkedIds.size}개)
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-5 gap-4">
              <StatCard icon={Database} label="Raw Data 행 수" value={stats.rawDataRows || 0} color="bg-blue-500" />
              <StatCard icon={Layers} label="대계정 수" value={stats.accountCount || 0} color="bg-purple-500" />
              <StatCard icon={GitBranch} label="메인 클러스터 수" value={stats.mainClusterCount || 0} color="bg-green-500" />
              <StatCard icon={Hash} label="서브 클러스터 수" value={stats.subClusterCount || 0} color="bg-orange-500" />
              <StatCard icon={DollarSign} label="총 금액" value={formatAmount(stats.totalAmount || 0)} color="bg-rose-500" />
            </div>
          )}

          {/* Tree Table */}
          <Card>
            <CardHeader className="pb-3 px-5 pt-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-semibold">비용 유형 분류</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{checkedIds.size}개 선택</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {!isReadOnly && (
                    <>
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={selectAll}>전체 선택</Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={deselectAll}>선택 해제</Button>
                      <span className="w-px h-4 bg-border" />
                    </>
                  )}
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={expandAll}>모두 펼치기</Button>
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={collapseAll}>모두 접기</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[40px] text-center" />
                      <TableHead className="pl-2">데이터 (비용유형분류)</TableHead>
                      <TableHead className="text-right w-[120px]">코스트센터 수</TableHead>
                      <TableHead className="text-right w-[120px]">공급업체 수</TableHead>
                      <TableHead className="text-right w-[140px]">합계 금액</TableHead>
                      <TableHead className="text-center w-[80px]">Raw Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody onMouseUp={() => setIsDragging(false)}>
                    {treeData.map(item => (
                      <TreeRow
                        key={getNodeId(item)}
                        item={item}
                        expandedIds={expandedIds}
                        toggleExpand={toggleExpand}
                        checkedIds={checkedIds}
                        onCheck={setCheckedIds}
                        isReadOnly={isReadOnly}
                        onItemClick={handleItemClick}
                        onRawDataClick={handleRowRawDataClick}
                        cursorIds={cursorIds}
                        onMouseDownRow={handleRowMouseDown}
                        onMouseEnterRow={handleRowMouseEnter}
                      />
                    ))}
                    <TableRow className="bg-primary/5 font-bold border-t-2">
                      <TableCell />
                      <TableCell className="pl-2 py-3"><span className="text-sm font-bold">합계</span></TableCell>
                      <TableCell className="text-right tabular-nums py-3">{totals.costCenterCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums py-3">{totals.supplierCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums py-3 font-bold">{formatAmount(totals.totalAmount)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Selected Item Stats Card */}
          {selectedItem && itemStats && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                선택 항목: {getNodeName(selectedItem)}
              </h3>
              <SelectedItemCard itemStats={itemStats} itemName={getNodeName(selectedItem)} onRawDataClick={handleOpenRawData} />
            </div>
          )}

          {/* Charts: 공급업체 + 코스트센터 */}
          {selectedItem && chartData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {getNodeName(selectedItem)} 차트
                </h3>
                <Select value={chartTop.toString()} onValueChange={v => setChartTop(+v)}>
                  <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">Top 5</SelectItem>
                    <SelectItem value="10">Top 10</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {chartLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* 공급업체 차트 */}
                  {supplierChartData.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2 px-5 pt-5">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-muted-foreground" />
                            공급업체별 금액 비교
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-2 pb-4">
                          <ResponsiveContainer width="100%" height={Math.max(200, supplierChartData.length * 32)}>
                            <BarChart data={[...supplierChartData].reverse()} layout="vertical" margin={{ left: 10, right: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" tick={{ fontSize: 10 }} unit="억" />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                              <Tooltip formatter={(v) => [`${v}억`, '금액']} />
                              <Bar dataKey="금액" radius={[0, 4, 4, 0]}>
                                {[...supplierChartData].reverse().map((item, idx) => {
                                  const origIdx = supplierChartData.findIndex(d => d.name === item.name);
                                  return <Cell key={idx} fill={CHART_COLORS[origIdx % CHART_COLORS.length]} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2 px-5 pt-5">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <Eye className="w-4 h-4 text-muted-foreground" />
                              공급업체별 금액 비율
                            </CardTitle>
                            <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7 px-2"
                              onClick={() => setRatioDetailModal({ open: true, title: '공급업체별 금액 비율', data: supplierChartData })}>
                              <Eye className="w-3 h-3 mr-1" />자세히 보기
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="px-5 pb-5">
                          <ChartPieWithLegend data={supplierChartData} />
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* 코스트센터 차트 */}
                  {costCenterChartData.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2 px-5 pt-5">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-muted-foreground" />
                            코스트센터별 금액 비교
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-2 pb-4">
                          <ResponsiveContainer width="100%" height={Math.max(200, costCenterChartData.length * 32)}>
                            <BarChart data={[...costCenterChartData].reverse()} layout="vertical" margin={{ left: 10, right: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" tick={{ fontSize: 10 }} unit="억" />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                              <Tooltip formatter={(v) => [`${v}억`, '금액']} />
                              <Bar dataKey="금액" radius={[0, 4, 4, 0]}>
                                {[...costCenterChartData].reverse().map((item, idx) => {
                                  const origIdx = costCenterChartData.findIndex(d => d.name === item.name);
                                  return <Cell key={idx} fill={CHART_COLORS[origIdx % CHART_COLORS.length]} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2 px-5 pt-5">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <Eye className="w-4 h-4 text-muted-foreground" />
                              코스트센터별 금액 비율
                            </CardTitle>
                            <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7 px-2"
                              onClick={() => setRatioDetailModal({ open: true, title: '코스트센터별 금액 비율', data: costCenterChartData })}>
                              <Eye className="w-3 h-3 mr-1" />자세히 보기
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="px-5 pb-5">
                          <ChartPieWithLegend data={costCenterChartData} />
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {!selectedItem && treeData.length > 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                차트를 보려면 트리에서 항목을 클릭하세요.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modals */}
      <RatioDetailModal open={ratioDetailModal.open} onClose={() => setRatioDetailModal({ open: false, title: '', data: null })} title={ratioDetailModal.title} data={ratioDetailModal.data} />
      <RawDataModal open={rawDataModal.open} onClose={() => setRawDataModal({ open: false, title: '', fetchFn: null })} title={rawDataModal.title} fetchRawData={rawDataModal.fetchFn} />

      {/* Short List 초기화 확인 다이얼로그 */}
      <Dialog open={shortListConfirmOpen} onOpenChange={setShortListConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Long List 초기화</DialogTitle>
            <DialogDescription>
              기존에 저장된 Long List 항목이 있습니다. 새로 Long List를 도출하면 기존 Long List 선택 항목이 초기화됩니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" size="sm" onClick={() => setShortListConfirmOpen(false)}>취소</Button>
            <Button size="sm" onClick={handleDeriveShortListConfirmed} className="bg-blue-600 hover:bg-blue-700">
              초기화 후 진행
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================
   Pie Chart with Legend (토글 기능)
   ============================================================ */
function ChartPieWithLegend({ data }) {
  const [hiddenItems, setHiddenItems] = useState(new Set());

  const visibleData = data.filter((_, idx) => !hiddenItems.has(idx));
  const visibleTotal = visibleData.reduce((s, d) => s + d.amount, 0);

  const toggleItem = (idx) => {
    setHiddenItems(prev => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  };

  return (
    <div className="flex items-start gap-6">
      <div className="relative">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={visibleData} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
              {visibleData.map((item, idx) => {
                const origIdx = data.indexOf(item);
                return <Cell key={idx} fill={CHART_COLORS[origIdx % CHART_COLORS.length]} />;
              })}
            </Pie>
            <Tooltip formatter={(v) => formatAmount(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] text-muted-foreground">합계</span>
          <span className="text-xs font-bold">{formatAmount(visibleTotal)}</span>
        </div>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0 max-h-[160px] overflow-y-auto">
        {data.map((item, idx) => (
          <div
            key={idx}
            className={cn('flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted/50', hiddenItems.has(idx) && 'opacity-40 line-through')}
            onClick={() => toggleItem(idx)}
          >
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
            <span className="truncate flex-1">{item.name}</span>
            <span className="font-semibold tabular-nums flex-shrink-0">{item.ratio}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   헬퍼: 체크된 항목에서 statisticsId 목록만 추출 (경량 저장용)
   - 부모 클러스터(Level 2)도 포함하여 ShortList 트리 구조 유지
   ============================================================ */
function collectAllStatisticsIds(treeData, checkedIds) {
  const ids = [];
  treeData.forEach(accountNode => {
    if (!accountNode.children) return;
    accountNode.children.forEach(cluster => {
      const clusterHasCheckedLeaf = cluster.children?.length
        ? cluster.children.some(sub => checkedIds.has(getNodeId(sub)))
        : checkedIds.has(getNodeId(cluster));

      if (!clusterHasCheckedLeaf) return;

      // Level 2 부모 클러스터 ID 포함
      if (cluster.statisticsId) ids.push(cluster.statisticsId);

      // Level 3 세부클러스터 ID 포함
      if (cluster.children?.length) {
        cluster.children.forEach(sub => {
          if (checkedIds.has(getNodeId(sub)) && sub.statisticsId) {
            ids.push(sub.statisticsId);
          }
        });
      }
    });
  });
  return ids;
}

/* ============================================================
   헬퍼: 체크된 항목에서 저장용 리스트 구성 (기존 호환용)
   ============================================================ */
function buildListItemsFromChecked(treeData, checkedIds) {
  const items = [];
  treeData.forEach(accountNode => {
    if (!accountNode.children) return;
    accountNode.children.forEach(cluster => {
      const clusterHasCheckedLeaf = cluster.children?.length
        ? cluster.children.some(sub => checkedIds.has(getNodeId(sub)))
        : checkedIds.has(getNodeId(cluster));

      if (!clusterHasCheckedLeaf) return;

      // 항상 level 2 클러스터 항목을 포함 (ShortList 트리 구조 유지용)
      items.push({
        statisticsId: cluster.statisticsId,
        sessionId: cluster.sessionId,
        accountName: cluster.accountName,
        clusterNumber: cluster.clusterNumber,
        clusterName: cluster.clusterName,
        level: cluster.level,
        parentClusterNumber: cluster.parentClusterNumber,
        totalAmount: cluster.totalAmount,
        totalCount: cluster.totalCount,
      });

      // level 3 세부클러스터 항목도 포함
      if (cluster.children?.length) {
        cluster.children.forEach(sub => {
          if (checkedIds.has(getNodeId(sub))) {
            items.push({
              statisticsId: sub.statisticsId,
              sessionId: sub.sessionId,
              accountName: sub.accountName,
              clusterNumber: sub.clusterNumber,
              clusterName: sub.clusterName,
              level: sub.level,
              parentClusterNumber: sub.parentClusterNumber,
              totalAmount: sub.totalAmount,
              totalCount: sub.totalCount,
            });
          }
        });
      }
    });
  });
  return items;
}
