import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight, ChevronDown, Database, Building2, MapPin,
  DollarSign, TrendingUp, FileSpreadsheet, Eye,
  Layers, BarChart3,
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

/* ============================================================
   색상 팔레트
   ============================================================ */
const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
  '#e11d48', '#84cc16', '#a855f7', '#0ea5e9', '#d946ef',
];

/* ============================================================
   임시 데이터
   ============================================================ */
const LEVELS = [
  { id: 1, label: '레벨 1', subClusterCount: 38, totalAmount: 95.0 },
  { id: 2, label: '레벨 2', subClusterCount: 12, totalAmount: 28.5 },
];

const TREE_DATA = [
  {
    id: '1',
    name: '간접비',
    coObjectCount: 15,
    offsetAccountCount: 5,
    totalAmount: 8500000000,
    children: [
      { id: '1-1', name: '복리후생비', coObjectCount: 5, offsetAccountCount: 2, totalAmount: 3200000000 },
      { id: '1-2', name: '여비교통비', coObjectCount: 4, offsetAccountCount: 1, totalAmount: 2100000000 },
      { id: '1-3', name: '통신비', coObjectCount: 3, offsetAccountCount: 1, totalAmount: 1800000000 },
      { id: '1-4', name: '수도광열비', coObjectCount: 3, offsetAccountCount: 1, totalAmount: 1400000000 },
    ],
  },
  {
    id: '2',
    name: '감가상각비',
    coObjectCount: 10,
    offsetAccountCount: 3,
    totalAmount: 6100000000,
    children: [
      { id: '2-1', name: '건물감가상각비', coObjectCount: 4, offsetAccountCount: 1, totalAmount: 2800000000 },
      { id: '2-2', name: '기계장치감가상각비', coObjectCount: 6, offsetAccountCount: 2, totalAmount: 3300000000 },
    ],
  },
  {
    id: '3',
    name: '경상연구개발비',
    coObjectCount: 8,
    offsetAccountCount: 3,
    totalAmount: 5200000000,
    children: [
      { id: '3-1', name: '인건비', coObjectCount: 5, offsetAccountCount: 2, totalAmount: 3500000000 },
      { id: '3-2', name: '재료비', coObjectCount: 3, offsetAccountCount: 1, totalAmount: 1700000000 },
    ],
  },
];

const RAW_DATA = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  costType: ['간접비', '감가상각비', '경상연구개발비'][i % 3],
  costSubType: ['복리후생비', '건물감가상각비', '인건비', '여비교통비', '기계장치감가상각비'][i % 5],
  coObject: `CO-${String(1000 + i).padStart(4, '0')}`,
  offsetAccount: `SA-${String(2000 + i).padStart(4, '0')}`,
  text: ['장비유지보수', '시설관리비용', '연구인력급여', '부품가공비', '사무용품구매'][i % 5],
  amount: Math.round((Math.random() * 5 + 0.5) * 100000000),
  company: ['(주)삼성전자', '(주)LG전자', '(주)현대모비스', '(주)SK하이닉스', '(주)포스코'][i % 5],
  center: ['생산1센터', '생산2센터', '연구개발센터', '품질관리센터', '물류센터'][i % 5],
}));

/* ============================================================
   헬퍼: 모든 leaf id 모으기
   ============================================================ */
function getAllLeafIds(items) {
  const ids = [];
  items.forEach(item => {
    if (item.children?.length) item.children.forEach(c => ids.push(c.id));
    else ids.push(item.id);
  });
  return ids;
}

/* ============================================================
   금액 포맷
   ============================================================ */
const formatAmount = (v) => {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (v >= 10000) return (v / 10000).toFixed(0) + '만';
  return v.toLocaleString();
};

const formatAmountFull = (v) => v.toLocaleString() + '원';

/* ============================================================
   Tree Table Row (체크박스 포함)
   ============================================================ */
function TreeRow({ item, level = 0, expandedIds, toggleExpand, checkedIds, onCheck }) {
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);
  const paddingLeft = 16 + level * 24;

  // 부모: 자식 전부 체크 → checked, 일부만 → indeterminate
  const isChecked = hasChildren
    ? item.children.every(c => checkedIds.has(c.id))
    : checkedIds.has(item.id);
  const isIndeterminate = hasChildren && !isChecked && item.children.some(c => checkedIds.has(c.id));

  const handleCheck = () => {
    if (hasChildren) {
      const childIds = item.children.map(c => c.id);
      if (isChecked) onCheck(prev => { const n = new Set(prev); childIds.forEach(id => n.delete(id)); return n; });
      else onCheck(prev => { const n = new Set(prev); childIds.forEach(id => n.add(id)); return n; });
    } else {
      onCheck(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; });
    }
  };

  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer transition-colors',
          level === 0 && 'bg-muted/30 font-medium',
          level > 0 && 'text-sm',
          (isChecked || (level > 0 && checkedIds.has(item.id))) && 'bg-blue-50',
        )}
        onClick={() => hasChildren && toggleExpand(item.id)}
      >
        <TableCell className="w-[40px] text-center py-2.5" onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={isIndeterminate ? 'indeterminate' : isChecked}
            onCheckedChange={handleCheck}
          />
        </TableCell>
        <TableCell style={{ paddingLeft: level > 0 ? paddingLeft : 8 }} className="py-2.5">
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </span>
            ) : <span className="w-4 h-4 flex-shrink-0" />}
            <span className={cn(level === 0 ? 'font-semibold' : 'text-foreground')}>{item.name}</span>
            {level === 0 && hasChildren && <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">{item.children.length}</Badge>}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{item.coObjectCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{item.offsetAccountCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5 font-medium">{formatAmount(item.totalAmount)}</TableCell>
      </TableRow>
      {isExpanded && hasChildren && item.children.map(child => (
        <TreeRow key={child.id} item={child} level={level + 1} expandedIds={expandedIds} toggleExpand={toggleExpand} checkedIds={checkedIds} onCheck={onCheck} />
      ))}
    </>
  );
}

/* ============================================================
   Detail Modal (비용유형 금액 비율 자세히 보기)
   ============================================================ */
function RatioDetailModal({ open, onClose, title, data }) {
  if (!data || data.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-600" />{title}
          </DialogTitle>
          <DialogDescription>선택된 항목의 금액 비율을 확인합니다.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center gap-6 py-4">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2} label={({ ratio }) => `${ratio}%`}>
                  {data.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatAmount(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-full space-y-2 px-4">
              {data.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                  <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatAmount(item.amount)}</span>
                  <Badge variant="secondary" className="text-xs tabular-nums min-w-[50px] justify-center">{item.ratio}%</Badge>
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
   Raw Data Modal (LongListPage와 동일한 포맷 - 심플 테이블 + 페이지네이션)
   ============================================================ */
function RawDataModal({ open, onClose, data }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.ceil(data.length / pageSize);
  const pagedData = data.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-green-600" />Raw Data</DialogTitle>
          <DialogDescription>원본 데이터를 확인합니다. 총 {data.length.toLocaleString()}건</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[60px] text-center">No</TableHead>
                <TableHead>비용유형</TableHead>
                <TableHead>비용유형(상세)</TableHead>
                <TableHead>코스트센터</TableHead>
                <TableHead>공급업체</TableHead>
                <TableHead>텍스트</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>업체명</TableHead>
                <TableHead>센터</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-center text-xs tabular-nums">{row.id}</TableCell>
                  <TableCell className="text-xs">{row.costType}</TableCell>
                  <TableCell className="text-xs">{row.costSubType}</TableCell>
                  <TableCell className="text-xs font-mono">{row.coObject}</TableCell>
                  <TableCell className="text-xs font-mono">{row.offsetAccount}</TableCell>
                  <TableCell className="text-xs">{row.text}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{formatAmountFull(row.amount)}</TableCell>
                  <TableCell className="text-xs">{row.company}</TableCell>
                  <TableCell className="text-xs">{row.center}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between text-xs pt-3 border-t">
          <span className="text-muted-foreground">{page * pageSize + 1}-{Math.min((page + 1) * pageSize, data.length)} / 총 {data.length.toLocaleString()}건</span>
          <div className="flex items-center gap-2">
            <Select value={pageSize.toString()} onValueChange={v => { setPageSize(+v); setPage(0); }}>
              <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{[20, 50, 100].map(n => <SelectItem key={n} value={n.toString()}>{n}개씩</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setPage(0)} disabled={page === 0}>처음</Button>
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setPage(p => p - 1)} disabled={page === 0}>이전</Button>
              <span className="flex items-center px-2 text-xs font-medium">{page + 1}/{totalPages || 1}</span>
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>다음</Button>
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>마지막</Button>
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-2"><Button variant="outline" onClick={() => onClose(false)}>닫기</Button></div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   메인 ShortListPage
   ============================================================ */
export default function ShortListPage() {
  const [currentLevel, setCurrentLevel] = useState(1);
  const [expandedIds, setExpandedIds] = useState(new Set(['1']));
  const [checkedIds, setCheckedIds] = useState(() => new Set(getAllLeafIds(TREE_DATA)));
  const [ratioDetailModal, setRatioDetailModal] = useState({ open: false, title: '', data: null });
  const [rawDataModal, setRawDataModal] = useState(false);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const expandAll = () => setExpandedIds(new Set(TREE_DATA.map(i => i.id)));
  const collapseAll = () => setExpandedIds(new Set());
  const selectAll = () => setCheckedIds(new Set(getAllLeafIds(TREE_DATA)));
  const deselectAll = () => setCheckedIds(new Set());

  /* -- 합계 -- */
  const totals = useMemo(() => TREE_DATA.reduce(
    (a, i) => ({ coObjectCount: a.coObjectCount + i.coObjectCount, offsetAccountCount: a.offsetAccountCount + i.offsetAccountCount, totalAmount: a.totalAmount + i.totalAmount }),
    { coObjectCount: 0, offsetAccountCount: 0, totalAmount: 0 }
  ), []);

  /* -- 체크된 항목 기준 차트 데이터 -- */
  const chartData = useMemo(() => {
    const items = [];
    TREE_DATA.forEach(parent => {
      if (!parent.children) return;
      parent.children.forEach(child => {
        if (checkedIds.has(child.id)) items.push(child);
      });
    });
    const total = items.reduce((s, i) => s + i.totalAmount, 0);
    return items.map(i => ({
      name: i.name,
      amount: i.totalAmount,
      ratio: total > 0 ? +(i.totalAmount / total * 100).toFixed(1) : 0,
    }));
  }, [checkedIds]);

  const barData = useMemo(() => chartData.map(d => ({ name: d.name, 금액: Math.round(d.amount / 100000000 * 10) / 10 })), [chartData]);
  const selectedTotal = useMemo(() => chartData.reduce((s, d) => s + d.amount, 0), [chartData]);

  /* -- 체크된 항목 기준 동적 통계 -- */
  const dynamicStats = useMemo(() => {
    let coObjectCount = 0;
    let offsetAccountCount = 0;
    let checkedLeafCount = 0;
    TREE_DATA.forEach(parent => {
      if (!parent.children) return;
      parent.children.forEach(child => {
        if (checkedIds.has(child.id)) {
          coObjectCount += child.coObjectCount;
          offsetAccountCount += child.offsetAccountCount;
          checkedLeafCount += 1;
        }
      });
    });
    const totalAmountBillion = selectedTotal / 100000000;
    const totalRatio = totals.totalAmount > 0 ? +(selectedTotal / totals.totalAmount * 100).toFixed(1) : 0;
    return {
      rawDataRows: RAW_DATA.length,
      suppliers: new Set(RAW_DATA.map(r => r.company)).size,
      costCenters: new Set(RAW_DATA.map(r => r.center)).size,
      selectedAmount: +totalAmountBillion.toFixed(1),
      totalRatio,
      checkedItems: checkedLeafCount,
    };
  }, [checkedIds, selectedTotal, totals.totalAmount]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ===== Header ===== */}
      <div className="flex-shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Short List 도출</h1>
            <p className="text-sm text-muted-foreground mt-1">계정/클러스터/세부클러스터별로 데이터를 선택하세요</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRawDataModal(true)}>
            <FileSpreadsheet className="w-4 h-4 mr-1" />Raw Data 보기
          </Button>
        </div>
      </div>

      {/* ===== Level Navigation ===== */}
      <div className="flex-shrink-0 bg-card border-b px-6 py-3">
        <div className="flex items-center gap-2">
          {LEVELS.map((level, idx) => (
            <React.Fragment key={level.id}>
              {idx > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              <button
                onClick={() => setCurrentLevel(level.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all',
                  currentLevel === level.id
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                <span>{level.label}</span>
                <Badge variant={currentLevel === level.id ? 'secondary' : 'outline'} className="text-[10px] px-1.5">
                  서브 {level.subClusterCount}
                </Badge>
                <span className="text-xs opacity-80">{level.totalAmount}억</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ===== Scrollable Content ===== */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">

          {/* ===== Stats Row (6 cards, 동적) ===== */}
          <div className="grid grid-cols-6 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500">
                    <Database className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Raw Data 행</p>
                    <p className="text-lg font-bold tabular-nums">{dynamicStats.rawDataRows}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-purple-500">
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">공급업체</p>
                    <p className="text-lg font-bold tabular-nums">{dynamicStats.suppliers}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-green-500">
                    <MapPin className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">코스트 센터</p>
                    <p className="text-lg font-bold tabular-nums">{dynamicStats.costCenters}</p>
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
                    <p className="text-lg font-bold tabular-nums">{dynamicStats.selectedAmount}<span className="text-xs font-normal ml-0.5">억</span></p>
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

          {/* ===== Tree Table (체크박스 포함) ===== */}
          <Card>
            <CardHeader className="pb-3 px-5 pt-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-semibold">비용 유형 분류</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{checkedIds.size}개 선택</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={selectAll}>전체 선택</Button>
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={deselectAll}>선택 해제</Button>
                  <span className="w-px h-4 bg-border" />
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
                    {TREE_DATA.map(item => (
                      <TreeRow key={item.id} item={item} expandedIds={expandedIds} toggleExpand={toggleExpand} checkedIds={checkedIds} onCheck={setCheckedIds} />
                    ))}
                    <TableRow className="bg-primary/5 font-bold border-t-2">
                      <TableCell />
                      <TableCell className="pl-2 py-3"><span className="text-sm font-bold">합계</span></TableCell>
                      <TableCell className="text-right tabular-nums py-3">{totals.coObjectCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums py-3">{totals.offsetAccountCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums py-3 font-bold">{formatAmount(totals.totalAmount)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* ===== Charts: 체크된 비용유형 기준 ===== */}
          {chartData.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Bar Chart - 선택 항목 금액 비교 (가로) */}
              <Card>
                <CardHeader className="pb-2 px-5 pt-5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      선택 항목 금액 비교
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">선택 합계: {formatAmount(selectedTotal)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32)}>
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

              {/* Pie Chart - 선택 항목 금액 비율 */}
              <Card>
                <CardHeader className="pb-2 px-5 pt-5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      선택 항목 금액 비율
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7 px-2"
                      onClick={() => setRatioDetailModal({ open: true, title: '선택 항목 금액 비율 자세히 보기', data: chartData })}>
                      <Eye className="w-3 h-3 mr-1" />자세히 보기
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="flex items-start gap-6">
                    <div className="relative">
                      <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                          <Pie data={chartData} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                            {chartData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => formatAmount(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] text-muted-foreground">합계</span>
                        <span className="text-xs font-bold">{formatAmount(selectedTotal)}</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1.5 min-w-0 max-h-[160px] overflow-y-auto">
                      {chartData.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                          <span className="truncate flex-1">{item.name}</span>
                          <span className="font-semibold tabular-nums flex-shrink-0">{item.ratio}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                차트를 표시하려면 위 목록에서 항목을 선택하세요.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modals */}
      <RatioDetailModal open={ratioDetailModal.open} onClose={() => setRatioDetailModal({ open: false, title: '', data: null })} title={ratioDetailModal.title} data={ratioDetailModal.data} />
      <RawDataModal open={rawDataModal} onClose={() => setRawDataModal(false)} data={RAW_DATA} />
    </div>
  );
}
