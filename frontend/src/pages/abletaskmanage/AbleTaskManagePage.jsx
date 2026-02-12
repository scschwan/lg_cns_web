import React, { useState } from 'react';
import {
  Search, Edit2, Eye, Trash2, FolderKanban, Filter,
  ArrowUpDown, ChevronRight, MoreHorizontal, TrendingUp,
  DollarSign, ClipboardList, CheckCircle2, Clock, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from 'recharts';

/* ============================================================
   색상
   ============================================================ */
const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316',
];

const STATUS_MAP = {
  '진행 중': { color: 'bg-blue-100 text-blue-700', icon: Clock },
  '검토 중': { color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
  '보류': { color: 'bg-gray-100 text-gray-700', icon: AlertCircle },
  '완료': { color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

/* ============================================================
   임시 데이터
   ============================================================ */
const TASKS = [
  { id: 1, name: '과제 1', majorAccount: '대계정 1', cluster: '서브 클러스터 3', department: '구매팀', manager: '박영호', consultant: '이민수', baseAmount: 2500000000, savingRate: 3.5, savingAmount: 87500000, progress: 65, status: '진행 중', documents: 3, createdAt: '2024-10-15' },
  { id: 2, name: '과제 2', majorAccount: '대계정 1', cluster: '서브 클러스터 5', department: '생산팀', manager: '김수현', consultant: '정하나', baseAmount: 1800000000, savingRate: 2.8, savingAmount: 50400000, progress: 40, status: '진행 중', documents: 5, createdAt: '2024-10-20' },
  { id: 3, name: '과제 3', majorAccount: '대계정 2', cluster: '서브 클러스터 8', department: '관리팀', manager: '최유진', consultant: '이민수', baseAmount: 3200000000, savingRate: 4.2, savingAmount: 134400000, progress: 85, status: '검토 중', documents: 7, createdAt: '2024-11-01' },
  { id: 4, name: '과제 4', majorAccount: '대계정 2, 대계정 3', cluster: '서브 클러스터 7, 11', department: '경영지원실', manager: '김민수', consultant: '이민수', baseAmount: 1370000000, savingRate: 2.0, savingAmount: 27400000, progress: 0, status: '진행 중', documents: 5, createdAt: '2024-11-10' },
  { id: 5, name: '과제 5', majorAccount: '대계정 3', cluster: '서브 클러스터 12', department: '영업팀', manager: '이정원', consultant: '정하나', baseAmount: 950000000, savingRate: 1.5, savingAmount: 14250000, progress: 20, status: '보류', documents: 2, createdAt: '2024-11-15' },
  { id: 6, name: '과제 6', majorAccount: '대계정 1', cluster: '서브 클러스터 2', department: '구매팀', manager: '박영호', consultant: '김태호', baseAmount: 4100000000, savingRate: 5.0, savingAmount: 205000000, progress: 100, status: '완료', documents: 10, createdAt: '2024-09-20' },
  { id: 7, name: '과제 7', majorAccount: '대계정 4', cluster: '서브 클러스터 15', department: '기획팀', manager: '한소영', consultant: '김태호', baseAmount: 2800000000, savingRate: 3.0, savingAmount: 84000000, progress: 55, status: '진행 중', documents: 4, createdAt: '2024-11-25' },
  { id: 8, name: '과제 8', majorAccount: '대계정 5', cluster: '서브 클러스터 20', department: '연구팀', manager: '송재원', consultant: '정하나', baseAmount: 1600000000, savingRate: 2.5, savingAmount: 40000000, progress: 30, status: '진행 중', documents: 3, createdAt: '2024-12-01' },
];

const SUMMARY_STATS = {
  totalTasks: TASKS.length,
  totalBaseAmount: TASKS.reduce((s, t) => s + t.baseAmount, 0),
  totalSavingAmount: TASKS.reduce((s, t) => s + t.savingAmount, 0),
  avgProgress: Math.round(TASKS.reduce((s, t) => s + t.progress, 0) / TASKS.length),
};

const STATUS_CHART_DATA = [
  { name: '진행 중', value: TASKS.filter(t => t.status === '진행 중').length },
  { name: '검토 중', value: TASKS.filter(t => t.status === '검토 중').length },
  { name: '보류', value: TASKS.filter(t => t.status === '보류').length },
  { name: '완료', value: TASKS.filter(t => t.status === '완료').length },
];

const CONSULTANT_CHART_DATA = (() => {
  const map = {};
  TASKS.forEach(t => {
    if (!map[t.consultant]) map[t.consultant] = { name: t.consultant, 과제수: 0, 절감액: 0 };
    map[t.consultant].과제수 += 1;
    map[t.consultant].절감액 += Math.round(t.savingAmount / 10000);
  });
  return Object.values(map);
})();

/* ============================================================
   금액 포맷
   ============================================================ */
const formatAmount = (v) => {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (v >= 10000000) return (v / 10000000).toFixed(1) + '천만';
  if (v >= 10000) return (v / 10000).toFixed(0) + '만';
  return v.toLocaleString();
};

/* ============================================================
   Task Detail Modal
   ============================================================ */
function TaskDetailModal({ open, onClose, task }) {
  if (!task) return null;
  const StatusIcon = STATUS_MAP[task.status]?.icon || Clock;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-600" />
            {task.name} 상세 정보
          </DialogTitle>
          <DialogDescription>과제 등록 정보를 확인합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">과제명:</span> <span className="font-medium">{task.name}</span></div>
            <div><span className="text-muted-foreground">상태:</span> <Badge className={cn('text-xs ml-1', STATUS_MAP[task.status]?.color)}>{task.status}</Badge></div>
            <div><span className="text-muted-foreground">대계정:</span> <span className="font-medium">{task.majorAccount}</span></div>
            <div><span className="text-muted-foreground">클러스터:</span> <span className="font-medium">{task.cluster}</span></div>
            <div><span className="text-muted-foreground">담당부서:</span> <span className="font-medium">{task.department}</span></div>
            <div><span className="text-muted-foreground">담당자:</span> <span className="font-medium">{task.manager}</span></div>
            <div><span className="text-muted-foreground">컨설턴트:</span> <span className="font-medium">{task.consultant}</span></div>
            <div><span className="text-muted-foreground">등록일:</span> <span className="font-medium">{task.createdAt}</span></div>
          </div>
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">모수 금액</span>
              <span className="font-semibold tabular-nums">{task.baseAmount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">예상 절감율</span>
              <span className="font-semibold tabular-nums">{task.savingRate}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">예상 절감액</span>
              <span className="font-semibold tabular-nums text-green-600">{task.savingAmount.toLocaleString()}원</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">진척율</span>
                <span className="font-semibold tabular-nums">{task.progress}%</span>
              </div>
              <Progress value={task.progress} className="h-2" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">등록 자료</span>
              <span className="font-semibold tabular-nums">{task.documents}건</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   메인 AbleTaskManagePage
   ============================================================ */
export default function AbleTaskManagePage() {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [detailTask, setDetailTask] = useState(null);

  const filteredTasks = TASKS.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (searchKeyword && !t.name.includes(searchKeyword) && !t.department.includes(searchKeyword) && !t.manager.includes(searchKeyword)) return false;
    return true;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Able 과제 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">등록된 과제의 현황을 관리하고 모니터링합니다</p>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">총 과제 수</p>
                    <p className="text-xl font-bold tabular-nums">{SUMMARY_STATS.totalTasks}<span className="text-sm font-normal ml-0.5">건</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">총 모수 금액</p>
                    <p className="text-xl font-bold tabular-nums">{formatAmount(SUMMARY_STATS.totalBaseAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">총 예상 절감액</p>
                    <p className="text-xl font-bold tabular-nums text-green-600">{formatAmount(SUMMARY_STATS.totalSavingAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
                    <FolderKanban className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">평균 진척율</p>
                    <p className="text-xl font-bold tabular-nums">{SUMMARY_STATS.avgProgress}<span className="text-sm font-normal ml-0.5">%</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 px-5 pt-4">
                <CardTitle className="text-sm font-semibold">과제 상태별 현황</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={STATUS_CHART_DATA} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} label={({ name, value }) => `${name} ${value}`}>
                      {STATUS_CHART_DATA.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 px-5 pt-4">
                <CardTitle className="text-sm font-semibold">컨설턴트별 과제 현황</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={CONSULTANT_CHART_DATA}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="과제수" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="절감액" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Filter & Table */}
          <Card>
            <CardHeader className="pb-3 px-5 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">과제 목록</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="과제명, 부서, 담당자 검색..."
                      value={searchKeyword}
                      onChange={e => setSearchKeyword(e.target.value)}
                      className="pl-8 h-8 w-[200px] text-xs"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 상태</SelectItem>
                      <SelectItem value="진행 중">진행 중</SelectItem>
                      <SelectItem value="검토 중">검토 중</SelectItem>
                      <SelectItem value="보류">보류</SelectItem>
                      <SelectItem value="완료">완료</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[50px] text-center">No</TableHead>
                      <TableHead>과제명</TableHead>
                      <TableHead>대계정</TableHead>
                      <TableHead>담당부서</TableHead>
                      <TableHead>컨설턴트</TableHead>
                      <TableHead className="text-right">모수 금액</TableHead>
                      <TableHead className="text-right">절감액</TableHead>
                      <TableHead className="w-[120px]">진척율</TableHead>
                      <TableHead className="text-center">상태</TableHead>
                      <TableHead className="text-center w-[80px]">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map((task) => {
                      const StatusIcon = STATUS_MAP[task.status]?.icon || Clock;
                      return (
                        <TableRow key={task.id} className="hover:bg-muted/30">
                          <TableCell className="text-center text-xs tabular-nums">{task.id}</TableCell>
                          <TableCell className="text-sm font-medium">{task.name}</TableCell>
                          <TableCell className="text-xs">{task.majorAccount}</TableCell>
                          <TableCell className="text-xs">{task.department}</TableCell>
                          <TableCell className="text-xs">{task.consultant}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatAmount(task.baseAmount)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums text-green-600 font-medium">{formatAmount(task.savingAmount)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={task.progress} className="h-1.5 flex-1" />
                              <span className="text-[10px] tabular-nums w-8 text-right">{task.progress}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={cn('text-[10px] px-1.5', STATUS_MAP[task.status]?.color)}>
                              {task.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDetailTask(task)}>
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredTasks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">검색 결과가 없습니다.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="px-5 py-3 border-t text-xs text-muted-foreground">
                총 {filteredTasks.length}건 표시 중
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail Modal */}
      <TaskDetailModal open={!!detailTask} onClose={() => setDetailTask(null)} task={detailTask} />
    </div>
  );
}
