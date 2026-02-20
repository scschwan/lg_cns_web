import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import costReductionService from '@/services/costReductionService';
import { useEditorLock } from '@/hooks/useEditorLock';
import { useDashboardStatus } from '@/hooks/useDashboardStatus';

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

/* ====== 노드에서 statisticsId가 있는 항목 수집 ====== */
function collectNodeData(nodes, checkedIds) {
  const items = [];
  const traverse = (node) => {
    if (node.children?.length) {
      node.children.forEach(traverse);
    } else if (node.statisticsId && checkedIds.has(node.statisticsId)) {
      items.push({
        statisticsId: node.statisticsId,
        sessionId: node.sessionId,
        accountName: node.accountName,
        clusterNumber: node.clusterNumber,
        clusterName: node.clusterName,
        level: node.level,
        parentClusterNumber: node.parentClusterNumber,
        totalAmount: node.totalAmount,
        totalCount: node.totalCount,
      });
    }
  };
  nodes.forEach(traverse);
  return items;
}

/* ====== Tree Row ====== */
function TreeRow({ item, level = 0, expandedIds, toggleExpand, checkedIds, onCheck, disabled, onItemClick }) {
  const hasChildren = item.children && item.children.length > 0;
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

  const handleCheck = () => {
    if (disabled) return;
    if (isChecked) {
      onCheck(prev => { const n = new Set(prev); leafIds.forEach(id => n.delete(id)); return n; });
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
          'cursor-pointer transition-colors',
          level === 0 && 'bg-muted/30 font-medium',
          level > 0 && 'text-sm',
          isChecked && 'bg-blue-50',
        )}
        onClick={handleRowClick}
      >
        <TableCell className="w-[40px] text-center py-2.5" onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={isIndeterminate ? 'indeterminate' : isChecked}
            onCheckedChange={handleCheck}
            disabled={disabled}
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
            {level === 0 && hasChildren && <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">{item.children.length}</Badge>}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{costCenterCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{supplierCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5 font-medium">{formatAmount(item.totalAmount)}</TableCell>
      </TableRow>
      {isExpanded && hasChildren && item.children.map(child => (
        <TreeRow key={child.id} item={child} level={level + 1} expandedIds={expandedIds} toggleExpand={toggleExpand} checkedIds={checkedIds} onCheck={onCheck} disabled={disabled} onItemClick={onItemClick} />
      ))}
    </>
  );
}

/* ====== Pie Chart with Legend ====== */
function ChartPieWithLegend({ data, title }) {
  const [hiddenItems, setHiddenItems] = useState(new Set());

  const visibleData = useMemo(
    () => data.filter((_, idx) => !hiddenItems.has(idx)),
    [data, hiddenItems]
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
                    const origIdx = data.findIndex(d => d.name === entry.name);
                    return <Cell key={idx} fill={CHART_COLORS[origIdx % CHART_COLORS.length]} />;
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
            {data.map((item, idx) => (
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
function SelectedItemCard({ stats }) {
  if (!stats) return null;
  const items = [
    { label: 'Raw Data 행', value: stats.rawDataRows?.toLocaleString() ?? '-', icon: Database, color: 'bg-blue-500' },
    { label: '공급업체', value: stats.supplierCount?.toLocaleString() ?? '-', icon: Building2, color: 'bg-purple-500' },
    { label: '코스트센터', value: stats.costCenterCount?.toLocaleString() ?? '-', icon: MapPin, color: 'bg-green-500' },
    { label: '합계 금액', value: formatAmount(stats.totalAmount ?? 0), icon: DollarSign, color: 'bg-orange-500' },
    { label: 'Long List 대비 비율', value: `${stats.ratioToTotal ?? 0}%`, icon: TrendingUp, color: 'bg-emerald-500' },
  ];
  return (
    <Card>
      <CardHeader className="pb-2 px-5 pt-4">
        <CardTitle className="text-sm font-semibold">선택 항목 상세</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-5 gap-3">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', item.color)}>
                <item.icon className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
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
function PhaseNavigationBar({ stats, currentPhase, projectId, navigate }) {
  const phases = [
    {
      key: 'LONG_LIST',
      label: 'Long List',
      count: stats?.longListItemCount ?? '-',
      amount: stats?.totalAmount ?? 0,
      path: `/projects/${projectId}/longlist`,
    },
    {
      key: 'SHORT_LIST',
      label: 'Short List',
      count: stats?.shortListItemCount ?? '-',
      amount: stats?.shortListTotalAmount ?? 0,
      path: `/projects/${projectId}/shortlist`,
    },
    {
      key: 'ABLE_REGISTER',
      label: 'Able 과제 등록',
      count: null,
      amount: null,
      path: `/projects/${projectId}/able-register`,
    },
  ];

  const currentIdx = phases.findIndex(p => p.key === currentPhase);

  return (
    <div className="flex items-center gap-1 py-2">
      {phases.map((phase, idx) => {
        const isActive = phase.key === currentPhase;
        const isPast = idx < currentIdx;
        return (
          <React.Fragment key={phase.key}>
            {idx > 0 && <ArrowRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />}
            <button
              onClick={() => navigate(phase.path)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors',
                isActive && 'bg-blue-600 text-white',
                isPast && 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                !isActive && !isPast && 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              {isPast && <CheckCircle2 className="w-3.5 h-3.5" />}
              <span className="font-medium">{phase.label}</span>
              {phase.count != null && (
                <Badge variant={isActive ? 'secondary' : 'outline'} className="text-[10px] px-1.5 py-0 ml-0.5">
                  {phase.count}건 / {formatAmount(phase.amount)}
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
  const { dashboardStatus } = useDashboardStatus(projectId);

  const [treeData, setTreeData] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [checkedIds, setCheckedIds] = useState(new Set());

  const [selectedNode, setSelectedNode] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [itemStats, setItemStats] = useState(null);
  const [chartTop, setChartTop] = useState(5);

  const isListLocked = dashboardStatus?.isListLocked ?? false;
  const isDisabled = !isEditor || isListLocked;

  // 초기 데이터 로드
  useEffect(() => {
    if (!projectId) return;
    const loadData = async () => {
      try {
        setLoading(true);
        const [treeRes, statsRes, selectionsRes] = await Promise.all([
          costReductionService.getShortListTree(projectId),
          costReductionService.getShortListStats(projectId),
          costReductionService.getShortListSelections(projectId),
        ]);

        const tree = treeRes.tree || [];
        setTreeData(tree);
        setStats(statsRes);

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
  const deselectAll = () => setCheckedIds(new Set());

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

  // 체크된 항목 기준 동적 통계
  const dynamicStats = useMemo(() => {
    const checkedItems = collectNodeData(treeData, checkedIds);
    const selectedAmount = checkedItems.reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalRatio = totals.totalAmount > 0 ? (selectedAmount / totals.totalAmount * 100) : 0;
    return {
      longListItemCount: stats?.longListItemCount ?? 0,
      checkedItems: checkedItems.length,
      selectedAmount,
      totalRatio: +totalRatio.toFixed(1),
    };
  }, [treeData, checkedIds, totals, stats]);

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

  // 바 차트용 데이터
  const barData = useMemo(() => {
    if (!chartData?.supplierBreakdown) return [];
    return chartData.supplierBreakdown.map(d => ({
      name: d.name,
      금액: Math.round((d.totalAmount || 0) / 100000000 * 10) / 10,
    }));
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
              {!isEditor && <Badge variant="secondary">뷰어 모드</Badge>}
              {isListLocked && <Badge variant="destructive">리스트 잠금</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-1">Long List에서 선택된 항목을 추가 필터링하세요</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleTransitionToAble}
              disabled={isDisabled || saving || checkedIds.size === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
              Able 과제 등록
            </Button>
          </div>
        </div>
        <PhaseNavigationBar stats={stats} currentPhase="SHORT_LIST" projectId={projectId} navigate={navigate} />
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
                    <p className="text-[10px] text-muted-foreground">Long List 항목</p>
                    <p className="text-lg font-bold tabular-nums">{dynamicStats.longListItemCount}</p>
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
                    <p className="text-[10px] text-muted-foreground">선택 금액 합계</p>
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
                    <p className="text-[10px] text-muted-foreground">전체 대비 비율</p>
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
                    <p className="text-[10px] text-muted-foreground">선택 항목 수</p>
                    <p className="text-lg font-bold tabular-nums">{dynamicStats.checkedItems}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tree Table */}
          <Card>
            <CardHeader className="pb-3 px-5 pt-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-semibold">비용 유형 분류 (Long List 기반)</CardTitle>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {treeData.map(item => (
                      <TreeRow key={item.id} item={item} expandedIds={expandedIds} toggleExpand={toggleExpand} checkedIds={checkedIds} onCheck={setCheckedIds} disabled={isDisabled} onItemClick={handleItemClick} />
                    ))}
                    {treeData.length > 0 && (
                      <TableRow className="bg-primary/5 font-bold border-t-2">
                        <TableCell />
                        <TableCell className="pl-2 py-3"><span className="text-sm font-bold">합계</span></TableCell>
                        <TableCell className="text-right tabular-nums py-3">{totals.costCenterCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums py-3">{totals.supplierCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums py-3 font-bold">{formatAmount(totals.totalAmount)}</TableCell>
                      </TableRow>
                    )}
                    {treeData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          Long List에서 선택된 항목이 없습니다. Long List 페이지에서 먼저 항목을 선택해주세요.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Item Stats Card */}
          {itemStats && <SelectedItemCard stats={itemStats} />}

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
                <div className="grid grid-cols-2 gap-4">
                  {/* Bar Chart */}
                  <Card>
                    <CardHeader className="pb-2 px-5 pt-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-muted-foreground" />
                        공급업체별 금액 비교
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 pb-4">
                      <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 32)}>
                        <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tick={{ fontSize: 10 }} unit="억" />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                          <Tooltip formatter={(v) => [`${v}억`, '금액']} />
                          <Bar dataKey="금액" radius={[0, 4, 4, 0]}>
                            {barData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Pie Charts */}
                  <div className="space-y-4">
                    {chartData.supplierBreakdown?.length > 0 && (
                      <ChartPieWithLegend data={chartData.supplierBreakdown} title="공급업체 비율" />
                    )}
                    {chartData.costCenterBreakdown?.length > 0 && (
                      <ChartPieWithLegend data={chartData.costCenterBreakdown} title="코스트센터 비율" />
                    )}
                  </div>
                </div>
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
    </div>
  );
}
