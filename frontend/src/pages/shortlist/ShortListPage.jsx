import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Database, Building2, MapPin,
  DollarSign, TrendingUp, FileSpreadsheet, Eye,
  Layers, BarChart3, ListChecks, ArrowRight, Loader2, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import costReductionService from '@/services/costReductionService';
import { useEditorLock } from '@/hooks/useEditorLock';
import { useDashboardStatus } from '@/hooks/useDashboardStatus';
import RawDataModal from '@/components/costreduction/RawDataModal';
import useViewerMode from '@/hooks/useViewerMode';

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
  '#e11d48', '#84cc16', '#a855f7', '#0ea5e9', '#d946ef',
];

const formatAmount = (v) => {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (v >= 10000) return (v / 10000).toFixed(0) + '만';
  return v?.toLocaleString() ?? '0';
};

/* ====== 모든 leaf ID 수집 ====== */
function getAllLeafIds(nodes) {
  const ids = [];
  const traverse = (node) => {
    if (node.children?.length) {
      node.children.forEach(traverse);
    } else if (node.statisticsId || node.id) {
      ids.push(node.statisticsId || node.id);
    }
  };
  nodes.forEach(traverse);
  return ids;
}

/* ====== 노드에서 체크된 항목 수집 (level 2 + level 3 모두 포함) ====== */
function collectNodeData(nodes, checkedIds) {
  const items = [];
  nodes.forEach(accountNode => {
    if (!accountNode.children) return;
    accountNode.children.forEach(cluster => {
      // level 2 클러스터의 하위 leaf 중 체크된 것이 있는지 확인
      const clusterHasCheckedLeaf = cluster.children?.length
        ? cluster.children.some(sub => checkedIds.has(sub.statisticsId || sub.id))
        : checkedIds.has(cluster.statisticsId || cluster.id);
      if (!clusterHasCheckedLeaf) return;

      // level 3 하위 항목 중 체크된 것만 먼저 수집
      const checkedSubs = [];
      if (cluster.children?.length) {
        cluster.children.forEach(sub => {
          if (checkedIds.has(sub.statisticsId || sub.id)) {
            checkedSubs.push(sub);
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

      // level 2 항목: 세부 클러스터가 있으면 체크된 것들의 합산으로 금액/건수 재계산
      const hasSubClusters = cluster.children?.length > 0;
      items.push({
        statisticsId: cluster.statisticsId,
        sessionId: cluster.sessionId,
        accountName: cluster.accountName,
        clusterNumber: cluster.clusterNumber,
        clusterName: cluster.clusterName,
        level: cluster.level,
        parentClusterNumber: cluster.parentClusterNumber,
        totalAmount: hasSubClusters
          ? checkedSubs.reduce((sum, s) => sum + (s.totalAmount || 0), 0)
          : cluster.totalAmount,
        totalCount: hasSubClusters
          ? checkedSubs.reduce((sum, s) => sum + (s.totalCount || 0), 0)
          : cluster.totalCount,
      });
    });
  });
  return items;
}

/* ====== Tree Row (드래그/Ctrl 멀티셀렉트 지원) ====== */
function TreeRow({ item, level = 0, expandedIds, toggleExpand, checkedIds, onCheck, disabled, onItemClick, onRawDataClick, lockedIds, cursorIds, onMouseDownRow, onMouseEnterRow }) {
  const hasChildren = item.children && item.children.length > 0;
  const nodeId = item.statisticsId || item.id;
  const isExpanded = expandedIds.has(item.id);
  const paddingLeft = 16 + level * 24;

  const leafIds = useMemo(() => {
    if (!hasChildren) return [item.statisticsId || item.id];
    const ids = [];
    const traverse = (n) => {
      if (n.children?.length) n.children.forEach(traverse);
      else ids.push(n.statisticsId || n.id);
    };
    item.children.forEach(traverse);
    return ids;
  }, [item, hasChildren]);

  const isChecked = leafIds.every(id => checkedIds.has(id));
  const isIndeterminate = !isChecked && leafIds.some(id => checkedIds.has(id));
  const isCursor = cursorIds?.has(nodeId);

  // 이 노드의 leaf 중 잠긴 항목이 있는지 확인
  const allLocked = lockedIds && leafIds.every(id => lockedIds.has(id));

  const handleCheck = () => {
    if (disabled || allLocked) return;
    // 커서가 잡힌 상태에서 체크 토글 → leaf 노드만 커서 일괄 적용
    // 부모 노드(hasChildren)는 항상 leafIds 기반 토글 (cursor 모드여도 하위 일괄 처리)
    if (cursorIds && cursorIds.size > 0 && cursorIds.has(nodeId) && !hasChildren) {
      onCheck(prev => {
        const n = new Set(prev);
        const shouldCheck = !isChecked;
        cursorIds.forEach(cursorNodeId => {
          if (shouldCheck) n.add(cursorNodeId);
          else if (!lockedIds || !lockedIds.has(cursorNodeId)) n.delete(cursorNodeId);
        });
        return n;
      });
      return;
    }
    // 부모 노드 또는 일반 클릭: leafIds 기반 토글
    if (isChecked) {
      // 체크 해제 시 잠긴 항목은 유지
      onCheck(prev => {
        const n = new Set(prev);
        leafIds.forEach(id => {
          if (!lockedIds || !lockedIds.has(id)) n.delete(id);
        });
        return n;
      });
    } else {
      onCheck(prev => { const n = new Set(prev); leafIds.forEach(id => n.add(id)); return n; });
    }
  };

  const displayName = level === 0 ? item.accountName : (item.clusterName || item.accountName || '');
  const supplierCount = item.supplierCount ?? 0;
  const costCenterCount = item.costCenterCount ?? 0;

  const handleRowClick = () => {
    if (hasChildren) toggleExpand(item.id);
    if (onItemClick && (item.statisticsId || item.accountName)) {
      onItemClick(item);
    }
  };

  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer transition-colors select-none',
          level === 0 && 'bg-muted/30 font-medium',
          level > 0 && 'text-sm',
          isChecked && 'bg-blue-50',
          allLocked && 'bg-red-50/50',
          isCursor && 'ring-1 ring-inset ring-blue-300 bg-blue-100',
        )}
        onClick={handleRowClick}
        onMouseDown={(e) => onMouseDownRow && onMouseDownRow(e, nodeId)}
        onMouseEnter={() => onMouseEnterRow && onMouseEnterRow(nodeId)}
      >
        <TableCell className="w-[40px] text-center py-2.5" onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={isIndeterminate ? 'indeterminate' : isChecked}
            onCheckedChange={handleCheck}
            disabled={disabled || allLocked}
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
            <span className={cn(level === 0 ? 'font-semibold' : 'text-foreground')}>{displayName}</span>
            {allLocked && <Badge variant="destructive" className="text-[9px] ml-1 px-1 py-0">과제 등록됨</Badge>}
            {level === 0 && hasChildren && <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">{item.children.length}</Badge>}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{costCenterCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{supplierCount.toLocaleString()}</TableCell>
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
        <TreeRow key={child.id} item={child} level={level + 1} expandedIds={expandedIds} toggleExpand={toggleExpand} checkedIds={checkedIds} onCheck={onCheck} disabled={disabled} onItemClick={onItemClick} onRawDataClick={onRawDataClick} lockedIds={lockedIds} cursorIds={cursorIds} onMouseDownRow={onMouseDownRow} onMouseEnterRow={onMouseEnterRow} />
      ))}
    </>
  );
}

/* ====== Ratio Detail Modal (금액 비율 자세히 보기) ====== */
function RatioDetailModal({ open, onClose, title, data }) {
  const [hiddenItems, setHiddenItems] = useState(new Set());

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

/* ====== Top N Summary Pie (Top3/5/10 vs 그 외) ====== */
function TopNSummaryPie({ data, title }) {
  const TOP_N = 3;
  const TOP3_COLOR = '#3b82f6';
  const REST_COLOR = '#94a3b8';

  const summaryData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const sorted = [...data].sort((a, b) => (b.amount || b.totalAmount || 0) - (a.amount || a.totalAmount || 0));
    const top3Items = sorted.slice(0, TOP_N);
    const restItems = sorted.slice(TOP_N);
    const top3Total = top3Items.reduce((s, d) => s + (d.amount || d.totalAmount || 0), 0);
    const restTotal = restItems.reduce((s, d) => s + (d.amount || d.totalAmount || 0), 0);
    const result = [{ name: 'Top3 합산', value: top3Total }];
    if (restItems.length > 0) {
      result.push({ name: '그 외', value: restTotal });
    }
    return result;
  }, [data]);

  const COLORS = [TOP3_COLOR, REST_COLOR];
  const total = summaryData.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader className="pb-2 px-5 pt-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" />{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="flex items-start gap-6">
          <div className="relative">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={summaryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {summaryData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatAmount(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-muted-foreground">합계</span>
              <span className="text-xs font-bold">{formatAmount(total)}</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            {summaryData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[idx] }} />
                <span className="truncate flex-1">{item.name}</span>
                <span className="font-semibold tabular-nums flex-shrink-0">{formatAmount(item.value)}</span>
                <span className="text-muted-foreground tabular-nums flex-shrink-0 w-10 text-right">
                  {total > 0 ? (item.value / total * 100).toFixed(1) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ====== Pie Chart with Legend (내림차순 정렬) ====== */
function ChartPieWithLegend({ data, title }) {
  const [hiddenItems, setHiddenItems] = useState(new Set());

  // 내림차순 정렬
  const sortedData = useMemo(
    () => [...data].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0)),
    [data]
  );

  const visibleData = useMemo(
    () => sortedData.filter((_, idx) => !hiddenItems.has(idx)),
    [sortedData, hiddenItems]
  );
  const total = useMemo(() => visibleData.reduce((s, d) => s + (d.totalAmount || 0), 0), [visibleData]);

  const pieData = visibleData.map(d => ({
    name: d.name,
    value: d.totalAmount || 0,
  }));

  const toggleItem = (idx) => {
    setHiddenItems(prev => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2 px-5 pt-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" />{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="flex items-start gap-6">
          <div className="relative">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {pieData.map((entry, idx) => {
                    return <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />;
                  })}
                </Pie>
                <Tooltip formatter={(v) => formatAmount(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-muted-foreground">합계</span>
              <span className="text-xs font-bold">{formatAmount(total)}</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5 min-w-0 max-h-[160px] overflow-y-auto">
            {sortedData.map((item, idx) => (
              <div
                key={idx}
                className={cn('flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5', hiddenItems.has(idx) && 'opacity-40 line-through')}
                onClick={() => toggleItem(idx)}
              >
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                <span className="truncate flex-1">{item.name}</span>
                <span className="font-semibold tabular-nums flex-shrink-0">{formatAmount(item.totalAmount)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ====== Selected Item Stats Card ====== */
function SelectedItemCard({ stats, onRawDataClick }) {
  if (!stats) return null;
  const items = [
    { label: 'Raw Data 행', value: stats.rawDataRows?.toLocaleString() ?? '-', icon: Database, color: 'bg-blue-500', clickable: true },
    { label: '공급업체', value: stats.supplierCount?.toLocaleString() ?? '-', icon: Building2, color: 'bg-purple-500' },
    { label: '코스트센터', value: stats.costCenterCount?.toLocaleString() ?? '-', icon: MapPin, color: 'bg-green-500' },
    { label: '합계 금액', value: formatAmount(stats.totalAmount ?? 0), icon: DollarSign, color: 'bg-orange-500' },
    { label: 'Raw List 대비 비율', value: `${stats.ratioToTotal ?? 0}%`, icon: TrendingUp, color: 'bg-emerald-500' },
  ];
  return (
    <Card>
      <CardHeader className="pb-2 px-5 pt-4">
        <CardTitle className="text-sm font-semibold">선택 항목 상세</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-5 gap-3">
          {items.map((item, idx) => (
            <div
              key={idx}
              className={cn('flex items-center gap-2', item.clickable && onRawDataClick && 'cursor-pointer hover:bg-blue-50 rounded-lg p-1 -m-1 transition-colors')}
              onClick={item.clickable ? onRawDataClick : undefined}
            >
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', item.color)}>
                <item.icon className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground">{item.label}</p>
                <p className="text-sm font-bold tabular-nums">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ====== Phase Navigation Bar ====== */
function PhaseNavigationBar({ stats, currentPhase, projectId, navigate, dynamicShortList, checkableItemCount }) {
  const phases = [
    {
      key: 'LONG_LIST',
      label: 'Raw List',
      line1: stats ? <><b>계정명</b> : {stats.rawAccountCount ?? '-'} / <b>클러스터</b> : {stats.rawClusterCount ?? '-'} / <b>세부</b> : {stats.rawSubClusterCount ?? '-'}</> : null,
      line2: stats ? <><b>합산금액</b> : {formatAmount(stats.rawTotalAmount ?? 0)}</> : null,
      path: `/projects/${projectId}/longlist`,
    },
    {
      key: 'SHORT_LIST',
      label: 'Long List',
      line1: stats ? <><b>계정명</b> : {stats.longListAccountCount ?? '-'} / <b>클러스터</b> : {stats.longListClusterCount ?? '-'} / <b>세부</b> : {stats.longListSubClusterCount ?? '-'}</> : null,
      line2: stats ? <><b>합산금액</b> : {formatAmount(stats.totalAmount ?? 0)}</> : null,
      path: `/projects/${projectId}/shortlist`,
    },
  ];

  const currentIdx = phases.findIndex(p => p.key === currentPhase);

  return (
    <div className="flex items-center gap-2 py-3 flex-wrap font-sans">
      {phases.map((phase, idx) => {
        const isActive = phase.key === currentPhase;
        const isPast = idx < currentIdx;
        return (
          <React.Fragment key={phase.key}>
            {idx > 0 && <ArrowRight className="w-6 h-6 text-muted-foreground/50 flex-shrink-0" />}
            <button
              onClick={() => navigate(phase.path)}
              className={cn(
                'flex items-center gap-3 px-6 py-4 rounded-lg text-base font-sans transition-colors',
                isActive && 'bg-blue-600 text-white',
                isPast && 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                !isActive && !isPast && 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              {isPast && <CheckCircle2 className="w-5 h-5" />}
              <span className="font-bold text-sm">{phase.label}</span>
              {phase.line1 != null && (
                <Badge variant={isActive ? 'secondary' : 'outline'} className="text-xs px-2.5 py-1.5 ml-1 leading-relaxed whitespace-pre-line text-left font-normal">
                  <span className="flex flex-col gap-0.5">
                    <span>{phase.line1}</span>
                    <span>{phase.line2}</span>
                  </span>
                </Badge>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ====== Main ShortListPage ====== */
export default function ShortListPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { isEditor } = useEditorLock(projectId);
  const { dashboardStatus, refetch: refetchDashboardStatus } = useDashboardStatus(projectId);
  const { isViewer } = useViewerMode(projectId);

  const [treeData, setTreeData] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lockedIds, setLockedIds] = useState(new Set());

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [checkedIds, setCheckedIds] = useState(new Set());

  const [selectedNode, setSelectedNode] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [itemStats, setItemStats] = useState(null);
  const [chartTop, setChartTop] = useState(5);
  const [rawDataModal, setRawDataModal] = useState({ open: false, title: '', fetchFn: null });
  const [ratioDetailModal, setRatioDetailModal] = useState({ open: false, title: '', data: null });

  // 드래그/Ctrl 멀티셀렉트 상태
  const [cursorIds, setCursorIds] = useState(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(null);

  const isListLocked = dashboardStatus?.isListLocked ?? false;
  const isDisabled = isViewer || !isEditor || isListLocked;
  const hasLockedItems = lockedIds.size > 0;

  // 트리를 flat list로 변환 (현재 확장된 상태 기반)
  const flatNodeIds = useMemo(() => {
    const ids = [];
    const traverse = (nodes) => {
      nodes.forEach(node => {
        const nid = node.statisticsId || node.id;
        ids.push(nid);
        if (node.children?.length && expandedIds.has(node.id)) {
          traverse(node.children);
        }
      });
    };
    traverse(treeData);
    return ids;
  }, [treeData, expandedIds]);

  const handleRowMouseDown = useCallback((e, nodeId) => {
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

  const handleRowMouseEnter = useCallback((nodeId) => {
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

  // 초기 데이터 로드
  useEffect(() => {
    if (!projectId) return;
    const loadData = async () => {
      try {
        setLoading(true);
        const [treeRes, statsRes, selectionsRes, lockedRes] = await Promise.all([
          costReductionService.getShortListTree(projectId),
          costReductionService.getShortListStats(projectId),
          costReductionService.getShortListSelections(projectId),
          costReductionService.getLockedStatisticsIds(projectId).catch(() => []),
        ]);

        const tree = treeRes.tree || [];
        setTreeData(tree);
        setStats(statsRes);
        setLockedIds(new Set(lockedRes || []));

        // 기본: 모든 항목 선택, 저장된 Short List 선택이 있으면 복원
        const savedItems = selectionsRes.items || [];
        if (savedItems.length > 0) {
          const savedIds = new Set(savedItems.map(i => i.statisticsId));
          setCheckedIds(savedIds);
        } else {
          setCheckedIds(new Set(getAllLeafIds(tree)));
        }

        // 모든 대분류 확장
        setExpandedIds(new Set(tree.map(n => n.id)));
      } catch (error) {
        console.error('Failed to load short list data:', error);
        // 잠금 상태 최신화
        refetchDashboardStatus();
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [projectId]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const expandAll = () => {
    const ids = new Set();
    const traverse = (nodes) => {
      nodes.forEach(n => { ids.add(n.id); if (n.children?.length) traverse(n.children); });
    };
    traverse(treeData);
    setExpandedIds(ids);
  };
  const collapseAll = () => setExpandedIds(new Set());
  const selectAll = () => setCheckedIds(new Set(getAllLeafIds(treeData)));
  const deselectAll = () => {
    // 잠긴 항목은 체크 유지
    if (lockedIds.size > 0) {
      setCheckedIds(new Set(lockedIds));
    } else {
      setCheckedIds(new Set());
    }
  };

  // 합계
  const totals = useMemo(() => {
    let totalAmount = 0, supplierCount = 0, costCenterCount = 0;
    treeData.forEach(n => {
      totalAmount += n.totalAmount || 0;
      supplierCount += n.supplierCount || 0;
      costCenterCount += n.costCenterCount || 0;
    });
    return { totalAmount, supplierCount, costCenterCount };
  }, [treeData]);

  // 체크 가능한 항목 수 (leaf 노드 수)
  const checkableItemCount = useMemo(() => getAllLeafIds(treeData).length, [treeData]);

  // 체크된 항목 기준 동적 통계 (leaf 단위로 정확히 계산)
  const dynamicStats = useMemo(() => {
    // leaf 노드 기준으로 체크된 항목의 금액 합산
    let selectedAmount = 0;
    let leafCheckedCount = 0;
    const traverse = (nodes) => {
      nodes.forEach(node => {
        if (node.children?.length) {
          traverse(node.children);
        } else {
          const nid = node.statisticsId || node.id;
          if (checkedIds.has(nid)) {
            selectedAmount += node.totalAmount || 0;
            leafCheckedCount++;
          }
        }
      });
    };
    traverse(treeData);

    const totalRatio = totals.totalAmount > 0 ? (selectedAmount / totals.totalAmount * 100) : 0;
    return {
      checkableItemCount,
      leafCheckedCount,
      selectedAmount,
      totalRatio: +totalRatio.toFixed(1),
    };
  }, [treeData, checkedIds, totals, checkableItemCount]);

  // 차트 데이터 로드 (항목 클릭 시 - 계정명/클러스터/세부클러스터 모두 지원)
  const handleItemClick = useCallback(async (node) => {
    setSelectedNode(node);
    try {
      let chartRes, itemStatsRes;
      if (node.statisticsId) {
        // 클러스터/세부클러스터 항목
        [chartRes, itemStatsRes] = await Promise.all([
          costReductionService.getShortListChart(projectId, node.statisticsId, chartTop),
          costReductionService.getShortListItemStats(projectId, node.statisticsId),
        ]);
      } else if (node.accountName) {
        // 계정명 항목 (level 1)
        [chartRes, itemStatsRes] = await Promise.all([
          costReductionService.getShortListAccountChart(projectId, node.accountName, chartTop),
          costReductionService.getShortListAccountItemStats(projectId, node.accountName),
        ]);
      } else {
        return;
      }
      setChartData(chartRes);
      setItemStats(itemStatsRes);
    } catch (error) {
      console.error('Failed to load chart data:', error);
    }
  }, [projectId, chartTop]);

  // Top N 변경 시 차트 재로드
  useEffect(() => {
    if (!selectedNode) return;
    const reload = async () => {
      try {
        let chartRes;
        if (selectedNode.statisticsId) {
          chartRes = await costReductionService.getShortListChart(projectId, selectedNode.statisticsId, chartTop);
        } else if (selectedNode.accountName) {
          chartRes = await costReductionService.getShortListAccountChart(projectId, selectedNode.accountName, chartTop);
        }
        if (chartRes) setChartData(chartRes);
      } catch (err) {
        console.error('Failed to reload chart:', err);
      }
    };
    reload();
  }, [chartTop]);

  // Raw Data 모달 열기
  const handleOpenRawData = useCallback(() => {
    if (!selectedNode || !projectId) return;
    const itemName = selectedNode.clusterName || selectedNode.accountName || '';
    let fetchFn;
    if (selectedNode.statisticsId) {
      fetchFn = (page, size) => costReductionService.getShortListRawData(projectId, selectedNode.statisticsId, page, size);
    } else if (selectedNode.accountName) {
      fetchFn = (page, size) => costReductionService.getShortListAccountRawData(projectId, selectedNode.accountName, page, size);
    }
    if (fetchFn) {
      setRawDataModal({ open: true, title: itemName, fetchFn });
    }
  }, [selectedNode, projectId]);

  // Raw Data 모달 열기 (트리 행에서 직접 호출)
  const handleRowRawDataClick = useCallback((item) => {
    if (!projectId) return;
    const itemName = item.clusterName || item.accountName || '';
    let fetchFn;
    if (item.statisticsId) {
      fetchFn = (page, size) => costReductionService.getShortListRawData(projectId, item.statisticsId, page, size);
    } else if (item.accountName) {
      fetchFn = (page, size) => costReductionService.getShortListAccountRawData(projectId, item.accountName, page, size);
    }
    if (fetchFn) {
      setRawDataModal({ open: true, title: itemName, fetchFn });
    }
  }, [projectId]);

  // Able 과제 등록 전환
  const handleTransitionToAble = async () => {
    try {
      setSaving(true);
      const items = collectNodeData(treeData, checkedIds);
      await costReductionService.saveShortListSelections(projectId, items);
      await costReductionService.transitionPhase(projectId, 'ABLE_REGISTER');
      navigate(`/projects/${projectId}/able-register`);
    } catch (error) {
      console.error('Failed to transition to Able Register:', error);
    } finally {
      setSaving(false);
    }
  };

  // 바 차트용 데이터 (내림차순 정렬, 0원은 하단)
  const barData = useMemo(() => {
    if (!chartData?.supplierBreakdown) return [];
    return chartData.supplierBreakdown
      .map(d => ({
        name: d.name,
        amount: d.totalAmount || 0,
        금액: Math.round((d.totalAmount || 0) / 100000000 * 10) / 10,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [chartData]);

  const costCenterBarData = useMemo(() => {
    if (!chartData?.costCenterBreakdown) return [];
    return chartData.costCenterBreakdown
      .map(d => ({
        name: d.name,
        amount: d.totalAmount || 0,
        금액: Math.round((d.totalAmount || 0) / 100000000 * 10) / 10,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [chartData]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
              <h1 className="text-xl font-bold text-foreground">Short List 도출</h1>
              {(isViewer || !isEditor) && <Badge variant="secondary">뷰어 모드</Badge>}
              {isListLocked && <Badge variant="destructive">리스트 잠금</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-1">Raw List에서 선택된 항목을 추가 필터링하세요</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleTransitionToAble}
              disabled={isDisabled || saving || checkedIds.size === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
              Short List 도출
            </Button>
          </div>
        </div>
        <PhaseNavigationBar stats={stats} currentPhase="SHORT_LIST" projectId={projectId} navigate={navigate} dynamicShortList={{ count: dynamicStats.leafCheckedCount, amount: dynamicStats.selectedAmount }} checkableItemCount={dynamicStats.checkableItemCount} />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500">
                    <ListChecks className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">Long List 항목</p>
                    <p className="text-lg font-bold tabular-nums">{dynamicStats.checkableItemCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-orange-500">
                    <DollarSign className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">선택 금액 합계</p>
                    <p className="text-lg font-bold tabular-nums">{formatAmount(dynamicStats.selectedAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-500">
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">전체 대비 비율</p>
                    <p className="text-lg font-bold tabular-nums text-green-600">{dynamicStats.totalRatio}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-rose-500">
                    <Layers className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">선택 항목 수</p>
                    <p className="text-lg font-bold tabular-nums">{dynamicStats.leafCheckedCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tree Table */}
          <Card>
            <CardHeader className="pb-3 px-5 pt-5">
              {hasLockedItems && (
                <div className="mb-3 px-3 py-2 rounded-md bg-red-50 border border-red-200">
                  <p className="text-xs font-medium text-red-600">
                    과제 등록된 항목은 체크해제 할 수 없습니다. 해제를 원할 경우 등록된 과제를 삭제해주세요.
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-semibold">비용 유형 분류 (Raw List 기반)</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{checkedIds.size}개 선택</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {!isDisabled && (
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
                      <TreeRow key={item.id} item={item} expandedIds={expandedIds} toggleExpand={toggleExpand} checkedIds={checkedIds} onCheck={setCheckedIds} disabled={isDisabled} onItemClick={handleItemClick} onRawDataClick={handleRowRawDataClick} lockedIds={lockedIds} cursorIds={cursorIds} onMouseDownRow={handleRowMouseDown} onMouseEnterRow={handleRowMouseEnter} />
                    ))}
                    {treeData.length > 0 && (
                      <TableRow className="bg-primary/5 font-bold border-t-2">
                        <TableCell />
                        <TableCell className="pl-2 py-3"><span className="text-sm font-bold">합계</span></TableCell>
                        <TableCell className="text-right tabular-nums py-3">{totals.costCenterCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums py-3">{totals.supplierCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums py-3 font-bold">{formatAmount(totals.totalAmount)}</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                    {treeData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          Raw List에서 선택된 항목이 없습니다. Raw List 페이지에서 먼저 항목을 선택해주세요.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Item Stats Card */}
          {itemStats && <SelectedItemCard stats={itemStats} onRawDataClick={handleOpenRawData} />}

          {/* Chart area - click any leaf node to see charts */}
          {treeData.length > 0 && (
            <div className="space-y-4">
              {/* Top N Selector */}
              {chartData && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">차트 표시:</span>
                  <Select value={chartTop.toString()} onValueChange={v => setChartTop(+v)}>
                    <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Top 5</SelectItem>
                      <SelectItem value="10">Top 10</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedNode && (
                    <Badge variant="outline" className="text-xs">
                      {selectedNode.clusterName || selectedNode.accountName}
                    </Badge>
                  )}
                </div>
              )}

              {chartData ? (
                <>
                  {/* 공급업체 차트 */}
                  {barData.length > 0 && (
                    <div className="grid grid-cols-3 gap-4">
                      <Card>
                        <CardHeader className="pb-2 px-5 pt-5">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-muted-foreground" />
                            공급업체별 금액 비교
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-2 pb-4">
                          <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 32)}>
                            <BarChart data={[...barData].reverse()} layout="vertical" margin={{ left: 10, right: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" tick={{ fontSize: 10 }} unit="억" />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                              <Tooltip formatter={(v) => [`${v}억`, '금액']} />
                              <Bar dataKey="금액" radius={[0, 4, 4, 0]}>
                                {[...barData].reverse().map((item, idx) => {
                                  const origIdx = barData.findIndex(d => d.name === item.name);
                                  return <Cell key={idx} fill={CHART_COLORS[origIdx % CHART_COLORS.length]} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                      <div>
                        <ChartPieWithLegend data={chartData.supplierBreakdown} title="공급업체별 금액 비율" />
                        <div className="flex justify-end px-5 pb-3 -mt-2">
                          <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7 px-2"
                            onClick={() => setRatioDetailModal({ open: true, title: '공급업체별 금액 비율', data: barData })}>
                            <Eye className="w-3 h-3 mr-1" />자세히 보기
                          </Button>
                        </div>
                      </div>
                      <TopNSummaryPie data={barData} title="공급업체 Top3 요약" />
                    </div>
                  )}

                  {/* 코스트센터 차트 */}
                  {costCenterBarData.length > 0 && (
                    <div className="grid grid-cols-3 gap-4">
                      <Card>
                        <CardHeader className="pb-2 px-5 pt-5">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-muted-foreground" />
                            코스트센터별 금액 비교
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-2 pb-4">
                          <ResponsiveContainer width="100%" height={Math.max(200, costCenterBarData.length * 32)}>
                            <BarChart data={[...costCenterBarData].reverse()} layout="vertical" margin={{ left: 10, right: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" tick={{ fontSize: 10 }} unit="억" />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                              <Tooltip formatter={(v) => [`${v}억`, '금액']} />
                              <Bar dataKey="금액" radius={[0, 4, 4, 0]}>
                                {[...costCenterBarData].reverse().map((item, idx) => {
                                  const origIdx = costCenterBarData.findIndex(d => d.name === item.name);
                                  return <Cell key={idx} fill={CHART_COLORS[origIdx % CHART_COLORS.length]} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                      <div>
                        <ChartPieWithLegend data={chartData.costCenterBreakdown} title="코스트센터별 금액 비율" />
                        <div className="flex justify-end px-5 pb-3 -mt-2">
                          <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7 px-2"
                            onClick={() => setRatioDetailModal({ open: true, title: '코스트센터별 금액 비율', data: costCenterBarData })}>
                            <Eye className="w-3 h-3 mr-1" />자세히 보기
                          </Button>
                        </div>
                      </div>
                      <TopNSummaryPie data={costCenterBarData} title="코스트센터 Top3 요약" />
                    </div>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    트리에서 항목(계정명/클러스터/세부클러스터)을 클릭하면 상세 차트가 표시됩니다.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Raw Data Modal */}
      <RawDataModal open={rawDataModal.open} onClose={() => setRawDataModal({ open: false, title: '', fetchFn: null })} title={rawDataModal.title} fetchRawData={rawDataModal.fetchFn} />
      {/* Ratio Detail Modal */}
      <RatioDetailModal open={ratioDetailModal.open} onClose={() => setRatioDetailModal({ open: false, title: '', data: null })} title={ratioDetailModal.title} data={ratioDetailModal.data} />
    </div>
  );
}
