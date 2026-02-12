import React, { useState } from 'react';
import {
  Search, Eye, Download, CheckCircle2, DollarSign, TrendingUp,
  Award, Calendar, FileText, BarChart3,
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
  LineChart, Line,
} from 'recharts';

/* ============================================================
   색상
   ============================================================ */
const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#f97316',
];

/* ============================================================
   임시 데이터
   ============================================================ */
const COMPLETED_TASKS = [
  { id: 1, name: '과제 6', majorAccount: '대계정 1', cluster: '서브 클러스터 2', department: '구매팀', manager: '박영호', consultant: '김태호', baseAmount: 4100000000, savingRate: 5.0, savingAmount: 205000000, actualSaving: 198000000, completedAt: '2024-12-15', documents: 10, rating: 'A' },
  { id: 2, name: '비용절감 프로젝트 A', majorAccount: '대계정 2', cluster: '서브 클러스터 6', department: '생산팀', manager: '김수현', consultant: '이민수', baseAmount: 3500000000, savingRate: 4.5, savingAmount: 157500000, actualSaving: 162000000, completedAt: '2024-11-30', documents: 8, rating: 'A+' },
  { id: 3, name: '원가개선 과제 B', majorAccount: '대계정 3', cluster: '서브 클러스터 10', department: '관리팀', manager: '최유진', consultant: '정하나', baseAmount: 2200000000, savingRate: 3.2, savingAmount: 70400000, actualSaving: 65000000, completedAt: '2024-11-20', documents: 6, rating: 'B+' },
  { id: 4, name: '물류비용 최적화', majorAccount: '대계정 4', cluster: '서브 클러스터 14', department: '물류팀', manager: '이정원', consultant: '김태호', baseAmount: 1800000000, savingRate: 2.8, savingAmount: 50400000, actualSaving: 55000000, completedAt: '2024-10-25', documents: 5, rating: 'A' },
  { id: 5, name: 'IT 인프라 비용절감', majorAccount: '대계정 5', cluster: '서브 클러스터 18', department: 'IT팀', manager: '한소영', consultant: '정하나', baseAmount: 2800000000, savingRate: 3.8, savingAmount: 106400000, actualSaving: 110000000, completedAt: '2024-10-10', documents: 12, rating: 'A+' },
  { id: 6, name: '에너지 효율 개선', majorAccount: '대계정 1', cluster: '서브 클러스터 4', department: '시설팀', manager: '송재원', consultant: '이민수', baseAmount: 1500000000, savingRate: 2.5, savingAmount: 37500000, actualSaving: 38000000, completedAt: '2024-09-15', documents: 4, rating: 'B' },
];

const SUMMARY = {
  totalCompleted: COMPLETED_TASKS.length,
  totalSavingTarget: COMPLETED_TASKS.reduce((s, t) => s + t.savingAmount, 0),
  totalActualSaving: COMPLETED_TASKS.reduce((s, t) => s + t.actualSaving, 0),
  achievementRate: Math.round(COMPLETED_TASKS.reduce((s, t) => s + t.actualSaving, 0) / COMPLETED_TASKS.reduce((s, t) => s + t.savingAmount, 0) * 100),
};

const MONTHLY_TREND = [
  { month: '7월', 목표: 0, 실적: 0 },
  { month: '8월', 목표: 0, 실적: 0 },
  { month: '9월', 목표: 3750, 실적: 3800 },
  { month: '10월', 목표: 15690, 실적: 16500 },
  { month: '11월', 목표: 22770, 실적: 22700 },
  { month: '12월', 목표: 62730, 실적: 62800 },
];

const DEPT_CHART_DATA = (() => {
  const map = {};
  COMPLETED_TASKS.forEach(t => {
    if (!map[t.department]) map[t.department] = { name: t.department, 절감액: 0 };
    map[t.department].절감액 += Math.round(t.actualSaving / 10000);
  });
  return Object.values(map).sort((a, b) => b.절감액 - a.절감액);
})();

const RATING_MAP = {
  'A+': 'bg-green-100 text-green-700 border-green-300',
  'A': 'bg-blue-100 text-blue-700 border-blue-300',
  'B+': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  'B': 'bg-orange-100 text-orange-700 border-orange-300',
};

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
function CompletedTaskDetailModal({ open, onClose, task }) {
  if (!task) return null;
  const achievementRate = Math.round(task.actualSaving / task.savingAmount * 100);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            {task.name} 완료 보고서
          </DialogTitle>
          <DialogDescription>완료된 과제의 상세 결과를 확인합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">과제명:</span> <span className="font-medium">{task.name}</span></div>
            <div><span className="text-muted-foreground">등급:</span> <Badge className={cn('text-xs ml-1 border', RATING_MAP[task.rating])}>{task.rating}</Badge></div>
            <div><span className="text-muted-foreground">대계정:</span> <span className="font-medium">{task.majorAccount}</span></div>
            <div><span className="text-muted-foreground">클러스터:</span> <span className="font-medium">{task.cluster}</span></div>
            <div><span className="text-muted-foreground">담당부서:</span> <span className="font-medium">{task.department}</span></div>
            <div><span className="text-muted-foreground">담당자:</span> <span className="font-medium">{task.manager}</span></div>
            <div><span className="text-muted-foreground">컨설턴트:</span> <span className="font-medium">{task.consultant}</span></div>
            <div><span className="text-muted-foreground">완료일:</span> <span className="font-medium">{task.completedAt}</span></div>
          </div>
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">모수 금액</span>
              <span className="font-semibold tabular-nums">{task.baseAmount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">예상 절감액</span>
              <span className="font-semibold tabular-nums">{task.savingAmount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">실제 절감액</span>
              <span className="font-semibold tabular-nums text-green-600">{task.actualSaving.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">달성율</span>
              <span className={cn('font-bold tabular-nums', achievementRate >= 100 ? 'text-green-600' : 'text-orange-600')}>{achievementRate}%</span>
            </div>
            <div className="space-y-1.5">
              <Progress value={Math.min(achievementRate, 100)} className="h-2" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" />보고서 다운로드
          </Button>
          <Button variant="outline" onClick={() => onClose(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   메인 CompletedTaskManagePage
   ============================================================ */
export default function CompletedTaskManagePage() {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [detailTask, setDetailTask] = useState(null);

  const filteredTasks = COMPLETED_TASKS.filter(t => {
    if (ratingFilter !== 'all' && t.rating !== ratingFilter) return false;
    if (searchKeyword && !t.name.includes(searchKeyword) && !t.department.includes(searchKeyword)) return false;
    return true;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">완료 과제 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">완료된 과제의 성과를 관리하고 분석합니다</p>
          </div>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" />
            전체 보고서 다운로드
          </Button>
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
                  <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">완료 과제 수</p>
                    <p className="text-xl font-bold tabular-nums">{SUMMARY.totalCompleted}<span className="text-sm font-normal ml-0.5">건</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">목표 절감액</p>
                    <p className="text-xl font-bold tabular-nums">{formatAmount(SUMMARY.totalSavingTarget)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">실제 절감액</p>
                    <p className="text-xl font-bold tabular-nums text-green-600">{formatAmount(SUMMARY.totalActualSaving)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
                    <Award className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">목표 달성율</p>
                    <p className="text-xl font-bold tabular-nums">{SUMMARY.achievementRate}<span className="text-sm font-normal ml-0.5">%</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 px-5 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  월별 절감 실적 추이
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={MONTHLY_TREND}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [`${v}만원`]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="목표" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="실적" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 px-5 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  부서별 절감 실적
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={DEPT_CHART_DATA} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                    <Tooltip formatter={(v) => [`${v}만원`, '절감액']} />
                    <Bar dataKey="절감액" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Task Table */}
          <Card>
            <CardHeader className="pb-3 px-5 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">완료 과제 목록</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="과제명, 부서 검색..." value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} className="pl-8 h-8 w-[180px] text-xs" />
                  </div>
                  <Select value={ratingFilter} onValueChange={setRatingFilter}>
                    <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 등급</SelectItem>
                      <SelectItem value="A+">A+</SelectItem>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="B+">B+</SelectItem>
                      <SelectItem value="B">B</SelectItem>
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
                      <TableHead>담당부서</TableHead>
                      <TableHead>컨설턴트</TableHead>
                      <TableHead className="text-right">모수 금액</TableHead>
                      <TableHead className="text-right">예상 절감액</TableHead>
                      <TableHead className="text-right">실제 절감액</TableHead>
                      <TableHead className="text-center">달성율</TableHead>
                      <TableHead className="text-center">등급</TableHead>
                      <TableHead className="text-center">완료일</TableHead>
                      <TableHead className="text-center w-[60px]">상세</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map((task) => {
                      const achievementRate = Math.round(task.actualSaving / task.savingAmount * 100);
                      return (
                        <TableRow key={task.id} className="hover:bg-muted/30">
                          <TableCell className="text-center text-xs tabular-nums">{task.id}</TableCell>
                          <TableCell className="text-sm font-medium">{task.name}</TableCell>
                          <TableCell className="text-xs">{task.department}</TableCell>
                          <TableCell className="text-xs">{task.consultant}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatAmount(task.baseAmount)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatAmount(task.savingAmount)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums text-green-600 font-medium">{formatAmount(task.actualSaving)}</TableCell>
                          <TableCell className="text-center">
                            <span className={cn('text-xs font-bold tabular-nums', achievementRate >= 100 ? 'text-green-600' : 'text-orange-600')}>
                              {achievementRate}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={cn('text-[10px] px-1.5 border', RATING_MAP[task.rating])}>{task.rating}</Badge>
                          </TableCell>
                          <TableCell className="text-center text-xs">{task.completedAt}</TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDetailTask(task)}>
                              <Eye className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredTasks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">검색 결과가 없습니다.</TableCell>
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
      <CompletedTaskDetailModal open={!!detailTask} onClose={() => setDetailTask(null)} task={detailTask} />
    </div>
  );
}
