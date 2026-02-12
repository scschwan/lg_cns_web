import React, { useState, useMemo } from 'react';
import {
  ChevronRight, ChevronDown, Database, Building2, MapPin,
  DollarSign, TrendingUp, FileSpreadsheet, Eye, Filter,
  Layers, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';

/* ============================================================
   색상 팔레트
   ============================================================ */
const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
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

const STATS = {
  rawDataRows: 15,
  suppliers: 5,
  costCenters: 8,
  selectedAmount: 6.1,
  totalRatio: 6.5,
  rawDataFiltered: 8,
};

const OFFSET_ACCOUNT_BAR_DATA = [
  { name: '상계계정 1', 금액: 2800 },
  { name: '상계계정 2', 금액: 2200 },
  { name: '상계계정 3', 금액: 1800 },
  { name: '상계계정 4', 금액: 1500 },
  { name: '상계계정 5', 금액: 1200 },
];

const COST_TYPE_BAR_DATA = [
  { name: '간접비', 금액: 8500 },
  { name: '감가상각비', 금액: 6100 },
  { name: '경상연구', 금액: 5200 },
  { name: '외주가공', 금액: 3800 },
  { name: '소모품', 금액: 2100 },
];

const COMPANY_RATIO = [
  { name: '(주)삼성전자', amount: 5500000000, ratio: 27.7 },
  { name: '(주)LG전자', amount: 3800000000, ratio: 19.2 },
  { name: '(주)현대모비스', amount: 3200000000, ratio: 16.1 },
  { name: '(주)SK하이닉스', amount: 2500000000, ratio: 12.6 },
  { name: '(주)포스코', amount: 1800000000, ratio: 9.1 },
  { name: '기타', amount: 3050000000, ratio: 15.3 },
];

const CENTER_RATIO = [
  { name: '생산1센터', amount: 6200000000, ratio: 31.2 },
  { name: '생산2센터', amount: 4500000000, ratio: 22.7 },
  { name: '연구개발센터', amount: 3800000000, ratio: 19.1 },
  { name: '품질관리센터', amount: 2800000000, ratio: 14.1 },
  { name: '기타', amount: 2550000000, ratio: 12.9 },
];

const RAW_DATA = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  fiscalYear: '2024',
  postingDate: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  documentNo: `DOC-${String(3000 + i).padStart(6, '0')}`,
  postingElement: ['자재비', '인건비', '경비', '외주비', '감가상각'][i % 5],
  costType: `CT-${String(100 + (i % 20)).padStart(3, '0')}`,
  valInRC: (Math.random() * 100).toFixed(1),
  costCenter: `CC-${String(500 + (i % 8)).padStart(4, '0')}`,
  branchName: ['서울본사', '수원사업장', '구미사업장', '청주사업장', '이천사업장'][i % 5],
  coObjectCode: `CO-${String(1000 + i).padStart(4, '0')}`,
  offsetAccount: `SA-${String(2000 + i).padStart(4, '0')}`,
  offsetAccountText: ['장비유지보수', '시설관리', '연구인력', '부품가공', '사무용품'][i % 5],
  business: ['전자', '반도체', '디스플레이', '배터리', 'IT서비스'][i % 5],
  classification: ['직접비', '간접비', '판관비'][i % 3],
  department: ['생산팀', '연구팀', '관리팀', '영업팀', '기획팀'][i % 5],
  amount: Math.round((Math.random() * 5 + 0.5) * 100000000),
}));

/* ============================================================
   금액 포맷
   ============================================================ */
const formatAmount = (v) => {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (v >= 10000) return (v / 10000).toFixed(0) + '만';
  return v.toLocaleString();
};

/* ============================================================
   Tree Table Row
   ============================================================ */
function TreeRow({ item, level = 0, expandedIds, toggleExpand }) {
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);
  const paddingLeft = 16 + level * 24;
  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer transition-colors',
          level === 0 && 'bg-muted/30 font-medium',
        )}
        onClick={() => hasChildren && toggleExpand(item.id)}
      >
        <TableCell style={{ paddingLeft }} className="py-2.5">
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </span>
            ) : (
              <span className="w-4 h-4 flex-shrink-0" />
            )}
            <span className={cn(level === 0 ? 'font-semibold' : '')}>{item.name}</span>
            {level === 0 && hasChildren && (
              <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">{item.children.length}</Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{item.coObjectCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{item.offsetAccountCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5 font-medium">{formatAmount(item.totalAmount)}</TableCell>
      </TableRow>
      {isExpanded && hasChildren && item.children.map(child => (
        <TreeRow key={child.id} item={child} level={level + 1} expandedIds={expandedIds} toggleExpand={toggleExpand} />
      ))}
    </>
  );
}

/* ============================================================
   Ratio Detail Modal
   ============================================================ */
function RatioDetailModal({ open, onClose, title, data }) {
  if (!data) return null;
  const pieData = data.map((d, i) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-600" />
            {title}
          </DialogTitle>
          <DialogDescription>항목별 금액 비율을 확인합니다.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center gap-6 py-4">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="ratio" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2} label={({ name, ratio }) => `${ratio}%`}>
                  {pieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} />
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
   Raw Data Modal
   ============================================================ */
function RawDataModal({ open, onClose, data }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [activeTab, setActiveTab] = useState('dashboard');

  const totalPages = Math.ceil(data.length / pageSize);
  const pagedData = data.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            Raw Data
          </DialogTitle>
          <DialogDescription>원본 데이터를 확인합니다. 총 {data.length.toLocaleString()}건</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="dashboard">대시보드</TabsTrigger>
            <TabsTrigger value="rawdata">Raw Data</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="flex-1 overflow-y-auto mt-4">
            <div className="space-y-4">
              <p className="text-sm font-semibold">분석 결과</p>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">비용유형별 금액 분포</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={COST_TYPE_BAR_DATA}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => `${v}백만`} />
                        <Bar dataKey="금액" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">업체별 금액 비율</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={COMPANY_RATIO} dataKey="ratio" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={2}>
                          {COMPANY_RATIO.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="rawdata" className="flex-1 overflow-hidden flex flex-col mt-4">
            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[50px] text-center">No</TableHead>
                    <TableHead>회계연도</TableHead>
                    <TableHead>전기일</TableHead>
                    <TableHead>문서번호</TableHead>
                    <TableHead>전기요소</TableHead>
                    <TableHead>원가유형</TableHead>
                    <TableHead className="text-right">Val%</TableHead>
                    <TableHead>코스트센터</TableHead>
                    <TableHead>지점명</TableHead>
                    <TableHead>CO오브젝트</TableHead>
                    <TableHead>상계계정</TableHead>
                    <TableHead>상계계정 텍스트</TableHead>
                    <TableHead>사업</TableHead>
                    <TableHead>분류</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedData.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-center text-xs tabular-nums">{row.id}</TableCell>
                      <TableCell className="text-xs">{row.fiscalYear}</TableCell>
                      <TableCell className="text-xs">{row.postingDate}</TableCell>
                      <TableCell className="text-xs font-mono">{row.documentNo}</TableCell>
                      <TableCell className="text-xs">{row.postingElement}</TableCell>
                      <TableCell className="text-xs font-mono">{row.costType}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{row.valInRC}%</TableCell>
                      <TableCell className="text-xs font-mono">{row.costCenter}</TableCell>
                      <TableCell className="text-xs">{row.branchName}</TableCell>
                      <TableCell className="text-xs font-mono">{row.coObjectCode}</TableCell>
                      <TableCell className="text-xs font-mono">{row.offsetAccount}</TableCell>
                      <TableCell className="text-xs">{row.offsetAccountText}</TableCell>
                      <TableCell className="text-xs">{row.business}</TableCell>
                      <TableCell className="text-xs">{row.classification}</TableCell>
                      <TableCell className="text-xs">{row.department}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{row.amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-xs pt-3 border-t flex-shrink-0">
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
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={() => onClose(false)}>닫기</Button>
        </div>
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
  const [ratioDetailModal, setRatioDetailModal] = useState({ open: false, title: '', data: null });
  const [rawDataModal, setRawDataModal] = useState(false);

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totals = useMemo(() => {
    return TREE_DATA.reduce(
      (acc, item) => ({
        coObjectCount: acc.coObjectCount + item.coObjectCount,
        offsetAccountCount: acc.offsetAccountCount + item.offsetAccountCount,
        totalAmount: acc.totalAmount + item.totalAmount,
      }),
      { coObjectCount: 0, offsetAccountCount: 0, totalAmount: 0 }
    );
  }, []);

  const companyPieData = COMPANY_RATIO.map((d, i) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  const centerPieData = CENTER_RATIO.map((d, i) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] }));

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ===== Header ===== */}
      <div className="flex-shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Short List 도출</h1>
            <p className="text-sm text-muted-foreground mt-1">계정/클러스터/세부클러스터별로 데이터를 선택하세요</p>
          </div>
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

          {/* ===== Tree Table ===== */}
          <Card>
            <CardHeader className="pb-3 px-5 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">비용 유형 분류</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setExpandedIds(new Set(TREE_DATA.map(i => i.id)))}>모두 펼치기</Button>
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setExpandedIds(new Set())}>모두 접기</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="pl-4">데이터 (비용유형분류)</TableHead>
                      <TableHead className="text-right w-[120px]">CO오브젝트 수</TableHead>
                      <TableHead className="text-right w-[120px]">상계계정 수</TableHead>
                      <TableHead className="text-right w-[140px]">합계 금액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {TREE_DATA.map(item => (
                      <TreeRow key={item.id} item={item} expandedIds={expandedIds} toggleExpand={toggleExpand} />
                    ))}
                    <TableRow className="bg-primary/5 font-bold border-t-2">
                      <TableCell className="pl-4 py-3"><span className="text-sm font-bold">합계</span></TableCell>
                      <TableCell className="text-right tabular-nums py-3">{totals.coObjectCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums py-3">{totals.offsetAccountCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums py-3 font-bold">{formatAmount(totals.totalAmount)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <div className="px-5 py-3 border-t flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setRawDataModal(true)}>
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Raw Data 조회
                </Button>
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4 mr-1" />
                  2개 필터링
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ===== Stats Row ===== */}
          <div className="grid grid-cols-6 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Raw Data 행</p>
                <p className="text-lg font-bold tabular-nums">{STATS.rawDataRows}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">공급업체</p>
                <p className="text-lg font-bold tabular-nums">{STATS.suppliers}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">코스트 센터</p>
                <p className="text-lg font-bold tabular-nums">{STATS.costCenters}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">선택 금액 합계</p>
                <p className="text-lg font-bold tabular-nums">{STATS.selectedAmount}<span className="text-xs font-normal ml-0.5">억</span></p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">전체 대비 비율</p>
                <p className="text-lg font-bold tabular-nums text-green-600">{STATS.totalRatio}%<TrendingUp className="w-3 h-3 inline ml-1" /></p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Raw Data 행</p>
                <p className="text-lg font-bold tabular-nums">{STATS.rawDataFiltered}</p>
              </CardContent>
            </Card>
          </div>

          {/* ===== Charts Row ===== */}
          <div className="grid grid-cols-2 gap-4">
            {/* Bar Charts */}
            <div className="grid grid-rows-2 gap-4">
              <Card>
                <CardHeader className="pb-2 px-5 pt-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    상계계정별 금액
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3">
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={OFFSET_ACCOUNT_BAR_DATA}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => [`${v}백만`, '금액']} />
                      <Bar dataKey="금액" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 px-5 pt-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    비용유형별 금액
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3">
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={COST_TYPE_BAR_DATA}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => [`${v}백만`, '금액']} />
                      <Bar dataKey="금액" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Pie Charts */}
            <div className="grid grid-rows-2 gap-4">
              <Card>
                <CardHeader className="pb-2 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      업체별 금액 비율
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="text-[10px] text-blue-600 h-6 px-1.5"
                      onClick={() => setRatioDetailModal({ open: true, title: '업체별 금액 비율 자세히 보기', data: COMPANY_RATIO })}>
                      <Eye className="w-3 h-3 mr-0.5" />자세히 보기
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-2 pb-3">
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={130}>
                      <PieChart>
                        <Pie data={companyPieData} dataKey="ratio" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                          {companyPieData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip formatter={(v) => `${v}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {COMPANY_RATIO.slice(0, 4).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[idx] }} />
                          <span className="truncate flex-1">{item.name}</span>
                          <span className="font-semibold tabular-nums">{item.ratio}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      센터별 금액 비율
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="text-[10px] text-blue-600 h-6 px-1.5"
                      onClick={() => setRatioDetailModal({ open: true, title: '센터별 금액 비율 자세히 보기', data: CENTER_RATIO })}>
                      <Eye className="w-3 h-3 mr-0.5" />자세히 보기
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-2 pb-3">
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={130}>
                      <PieChart>
                        <Pie data={centerPieData} dataKey="ratio" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                          {centerPieData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip formatter={(v) => `${v}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {CENTER_RATIO.slice(0, 4).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[idx] }} />
                          <span className="truncate flex-1">{item.name}</span>
                          <span className="font-semibold tabular-nums">{item.ratio}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <RatioDetailModal
        open={ratioDetailModal.open}
        onClose={() => setRatioDetailModal({ open: false, title: '', data: null })}
        title={ratioDetailModal.title}
        data={ratioDetailModal.data}
      />
      <RawDataModal open={rawDataModal} onClose={() => setRawDataModal(false)} data={RAW_DATA} />
    </div>
  );
}
