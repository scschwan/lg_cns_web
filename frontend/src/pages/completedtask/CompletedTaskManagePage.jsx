import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Search, Eye, Download, CheckCircle2, DollarSign, TrendingUp,
  Award, FileText, BarChart3, Edit2, Link2, FileIcon,
  ExternalLink, Save, X, Loader2, RotateCcw, AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import costReductionService from '@/services/costReductionService';
import { useEditorLock } from '@/hooks/useEditorLock';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#f97316'];
const RATING_MAP = {
  'A+': 'bg-green-100 text-green-700 border-green-300',
  'A': 'bg-blue-100 text-blue-700 border-blue-300',
  'B+': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  'B': 'bg-orange-100 text-orange-700 border-orange-300',
};

const formatAmount = (v) => {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (v >= 10000000) return (v / 10000000).toFixed(1) + '천만';
  if (v >= 10000) return (v / 10000).toFixed(0) + '만';
  return v?.toLocaleString() ?? '0';
};

function getClusterNames(clusters, level) {
  const arr = clusters || [];
  if (level === 2) {
    const names = new Set();
    arr.forEach(c => {
      if (c.level === 2 && c.clusterName) names.add(c.clusterName);
      if (c.level === 3 && c.parentClusterName) names.add(c.parentClusterName);
    });
    return [...names];
  }
  return [...new Set(arr.filter(c => c.level === 3).map(c => c.clusterName).filter(Boolean))];
}

function ClusterNames({ clusters, level }) {
  const names = getClusterNames(clusters, level);
  if (names.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <span title={names.join(', ')}>
      <span className="truncate">{names[0]}</span>
      {names.length > 1 && <span className="text-muted-foreground ml-0.5">+{names.length - 1}</span>}
    </span>
  );
}

/* ====== Detail Modal ====== */
function CompletedTaskDetailModal({ open, onClose, task }) {
  if (!task) return null;
  const achievementRate = task.expectedSavingAmount > 0 ? Math.round((task.actualSaving || 0) / task.expectedSavingAmount * 100) : 0;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" />{task.taskName} 완료 보고서</DialogTitle>
          <DialogDescription>완료된 과제의 상세 결과를 확인합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">과제명:</span> <span className="font-medium">{task.taskName}</span></div>
            <div><span className="text-muted-foreground">등급:</span> <Badge className={cn('text-xs ml-1 border', RATING_MAP[task.rating])}>{task.rating || '-'}</Badge></div>
            <div><span className="text-muted-foreground">대계정:</span> <span className="font-medium">{task.majorAccounts?.join(', ') || '-'}</span></div>
            <div><span className="text-muted-foreground">클러스터명:</span> <span className="font-medium">{getClusterNames(task.clusters, 2).join(', ') || '-'}</span></div>
            <div><span className="text-muted-foreground">세부클러스터명:</span> <span className="font-medium">{getClusterNames(task.clusters, 3).join(', ') || '-'}</span></div>
            <div><span className="text-muted-foreground">담당부서:</span> <span className="font-medium">{task.department || '-'}</span></div>
            <div><span className="text-muted-foreground">담당자:</span> <span className="font-medium">{task.manager || '-'}</span></div>
            <div><span className="text-muted-foreground">컨설턴트:</span> <span className="font-medium">{task.consultant || '-'}</span></div>
          </div>
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">모수 금액</span><span className="font-semibold tabular-nums">{task.baseAmount ? task.baseAmount.toLocaleString() + '원' : '-'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">예상 절감액</span><span className="font-semibold tabular-nums">{task.expectedSavingAmount ? task.expectedSavingAmount.toLocaleString() + '원' : '-'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">실제 절감액</span><span className="font-semibold tabular-nums text-green-600">{task.actualSaving ? task.actualSaving.toLocaleString() + '원' : '-'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">달성율</span><span className={cn('font-bold tabular-nums', achievementRate >= 100 ? 'text-green-600' : 'text-orange-600')}>{achievementRate}%</span></div>
            <Progress value={Math.min(achievementRate, 100)} className="h-2" />
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onClose(false)}>닫기</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====== Edit Modal ====== */
function EditTaskModal({ open, onClose, task, onSave }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (task) setForm({ taskName: task.taskName, department: task.department, consultant: task.consultant, baseAmount: task.baseAmount, expectedSavingAmount: task.expectedSavingAmount, actualSaving: task.actualSaving, rating: task.rating, customerFollowUp: task.customerFollowUp, actionItems: task.actionItems });
  }, [task]);
  if (!task) return null;
  const handleChange = (f, v) => setForm(prev => ({ ...prev, [f]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Edit2 className="w-5 h-5 text-blue-600" />과제 정보 수정</DialogTitle>
          <DialogDescription>과제 정보를 수정한 후 저장하세요.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>과제명</Label><Input value={form.taskName || ''} onChange={e => handleChange('taskName', e.target.value)} className="text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>담당부서</Label><Input value={form.department || ''} onChange={e => handleChange('department', e.target.value)} className="text-sm" /></div>
            <div className="space-y-1.5"><Label>컨설턴트</Label><Input value={form.consultant || ''} onChange={e => handleChange('consultant', e.target.value)} className="text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>모수금액</Label><Input type="number" value={form.baseAmount || ''} onChange={e => handleChange('baseAmount', +e.target.value)} className="text-sm tabular-nums" /></div>
            <div className="space-y-1.5"><Label>예상절감액</Label><Input type="number" value={form.expectedSavingAmount || ''} onChange={e => handleChange('expectedSavingAmount', +e.target.value)} className="text-sm tabular-nums" /></div>
          </div>
          <div className="space-y-1.5"><Label>실제절감액</Label><Input type="number" value={form.actualSaving || ''} onChange={e => handleChange('actualSaving', +e.target.value)} className="text-sm tabular-nums" /></div>
          <div className="space-y-1.5"><Label>등급</Label>
            <Select value={form.rating || ''} onValueChange={v => handleChange('rating', v)}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="등급 선택" /></SelectTrigger>
              <SelectContent><SelectItem value="A+">A+</SelectItem><SelectItem value="A">A</SelectItem><SelectItem value="B+">B+</SelectItem><SelectItem value="B">B</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>고객사 Follow Up</Label><Textarea value={form.customerFollowUp || ''} onChange={e => handleChange('customerFollowUp', e.target.value)} placeholder="고객사 follow up 내용을 입력하세요" rows={3} className="text-sm" /></div>
          <div className="space-y-1.5"><Label>조치사항</Label><Textarea value={form.actionItems || ''} onChange={e => handleChange('actionItems', e.target.value)} placeholder="조치사항을 입력하세요" rows={3} className="text-sm" /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onClose(false)}>취소</Button>
          <Button onClick={() => { onSave(task.id, form); onClose(false); }} className="gap-1.5"><Save className="w-4 h-4" />저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====== Documents Modal ====== */
function DocumentsModal({ open, onClose, task, projectId }) {
  const [docs, setDocs] = useState([]);
  useEffect(() => {
    if (task && open) costReductionService.getTaskDocuments(projectId, task.id).then(setDocs).catch(console.error);
  }, [task, open, projectId]);
  if (!task) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-violet-600" />자료 조회</DialogTitle>
          <DialogDescription>{task.taskName} - 총 {docs.length}건의 자료</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {docs.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">등록된 자료가 없습니다.</p>}
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40">
              <div className="flex items-center gap-2.5 min-w-0">
                {doc.type === 'link' ? <Link2 className="w-4 h-4 text-blue-500 flex-shrink-0" /> : <FileIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                <span className="text-sm font-medium truncate">{doc.label}</span>
                <Badge variant="outline" className={cn('text-[10px] px-1.5 flex-shrink-0', doc.type === 'link' ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-gray-300 bg-gray-50 text-gray-600')}>{doc.type === 'link' ? '링크' : '파일'}</Badge>
              </div>
              {doc.type === 'link' && doc.url && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0" onClick={() => window.open(doc.url, '_blank')}><ExternalLink className="w-3.5 h-3.5" /></Button>}
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onClose(false)}>닫기</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====== Phase Navigation Bar ====== */
function PhaseNavigationBar({ stats, summary, completedSummary, currentPhase, projectId, navigate }) {
  const phases = [
    {
      key: 'LONG_LIST', label: 'Raw List',
      line1: stats ? <><b>대계정</b> : {stats.rawAccountCount ?? '-'} / <b>클러스터</b> : {stats.rawClusterCount ?? '-'} / <b>세부</b> : {stats.rawSubClusterCount ?? '-'}</> : null,
      line2: stats ? <><b>합산금액</b> : {formatAmount(stats.rawTotalAmount ?? 0)}</> : null,
      path: `/projects/${projectId}/longlist`,
    },
    {
      key: 'SHORT_LIST', label: 'Long List',
      line1: stats ? <><b>대계정</b> : {stats.longListAccountCount ?? '-'} / <b>클러스터</b> : {stats.longListClusterCount ?? '-'} / <b>세부</b> : {stats.longListSubClusterCount ?? '-'}</> : null,
      line2: stats ? <><b>합산금액</b> : {formatAmount(stats.totalAmount ?? 0)}</> : null,
      path: `/projects/${projectId}/shortlist`,
    },
    {
      key: 'ABLE_REGISTER', label: 'Short List',
      line1: stats ? <><b>대계정</b> : {stats.shortListAccountCount ?? '-'} / <b>클러스터</b> : {stats.shortListClusterCount ?? '-'} / <b>세부</b> : {stats.shortListSubClusterCount ?? '-'}</> : null,
      line2: stats ? <><b>합산금액</b> : {formatAmount(stats.shortListTotalAmount ?? 0)}</> : null,
      path: `/projects/${projectId}/able-register`,
    },
    {
      key: 'ABLE_MANAGE', label: 'Able 과제',
      line1: summary ? <><b>과제수</b> : {summary.totalTasks ?? 0}건</> : null,
      line2: summary ? <><b>합산금액</b> : {formatAmount(summary.totalBaseAmount ?? 0)}</> : null,
      path: `/projects/${projectId}/able-manage`,
    },
    {
      key: 'COMPLETED', label: '완료 과제',
      line1: completedSummary ? <><b>완료</b> : {completedSummary.totalCompleted}건 / <b>예상절감</b> : {formatAmount(completedSummary.totalSavingTarget)}</> : null,
      line2: completedSummary ? <><b>합산금액</b> : {formatAmount(completedSummary.totalBaseAmount ?? 0)}</> : null,
      path: `/projects/${projectId}/completed-manage`,
    },
  ];
  const currentIdx = phases.findIndex(p => p.key === currentPhase);
  return (
    <div className="flex items-center gap-1.5 py-3 font-sans w-full">
      {phases.map((phase, idx) => {
        const isActive = phase.key === currentPhase;
        const isPast = idx < currentIdx;
        return (
          <React.Fragment key={phase.key}>
            {idx > 0 && <ArrowRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />}
            <button
              onClick={() => navigate(phase.path)}
              className={cn(
                'flex-1 basis-0 flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-lg font-sans transition-colors min-w-0',
                isActive && 'bg-blue-600 text-white',
                isPast && 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                !isActive && !isPast && 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              <div className="flex items-center gap-1.5">
                {isPast && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
                <span className="font-bold text-base whitespace-nowrap">{phase.label}</span>
              </div>
              {phase.line1 != null && (
                <div className={cn('text-[15px] leading-snug text-center font-medium', isActive ? 'text-white/90' : '')}>
                  <div>{phase.line1}</div>
                  <div>{phase.line2}</div>
                </div>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ====== Main ====== */
export default function CompletedTaskManagePage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { isEditor } = useEditorLock(projectId);
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [phaseStats, setPhaseStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [detailTask, setDetailTask] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [docsTask, setDocsTask] = useState(null);
  const [resetTask, setResetTask] = useState(null);
  const [resetting, setResetting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [allTasks, summaryRes, statsRes] = await Promise.all([
        costReductionService.getTasks(projectId),
        costReductionService.getTaskSummary(projectId),
        costReductionService.getShortListStats(projectId).catch(() => null),
      ]);
      setTasks(allTasks.filter(t => t.status === '완료'));
      setSummary(summaryRes);
      setPhaseStats(statsRes);
    } catch (error) {
      console.error('Failed to load completed tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (projectId) loadData(); }, [projectId]);

  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (ratingFilter !== 'all' && t.rating !== ratingFilter) return false;
    if (searchKeyword && !t.taskName?.includes(searchKeyword) && !t.department?.includes(searchKeyword)) return false;
    return true;
  }), [tasks, ratingFilter, searchKeyword]);

  const handleSaveTask = async (taskId, form) => {
    try { await costReductionService.updateTask(projectId, taskId, form); loadData(); } catch (error) { console.error('Failed to update task:', error); }
  };

  const handleResetConfirm = async () => {
    if (!resetTask) return;
    try {
      setResetting(true);
      await costReductionService.resetTask(projectId, resetTask.id);
      setResetTask(null);
      loadData();
    } catch (error) {
      console.error('Failed to reset task:', error);
    } finally {
      setResetting(false);
    }
  };

  const completedSummary = useMemo(() => {
    const totalBaseAmount = tasks.reduce((s, t) => s + (t.baseAmount || 0), 0);
    const totalSavingTarget = tasks.reduce((s, t) => s + (t.expectedSavingAmount || 0), 0);
    const totalActualSaving = tasks.reduce((s, t) => s + (t.actualSaving || 0), 0);
    return {
      totalCompleted: tasks.length,
      totalBaseAmount,
      totalSavingTarget,
      totalActualSaving,
      achievementRate: totalSavingTarget > 0 ? Math.round(totalActualSaving / totalSavingTarget * 100) : 0,
    };
  }, [tasks]);

  const deptChartData = useMemo(() => {
    const map = {};
    tasks.forEach(t => { const d = t.department || '미배정'; if (!map[d]) map[d] = { name: d, 절감액: 0 }; map[d].절감액 += Math.round((t.actualSaving || 0) / 10000); });
    return Object.values(map).sort((a, b) => b.절감액 - a.절감액);
  }, [tasks]);

  const ratingChartData = useMemo(() => {
    const map = {};
    tasks.forEach(t => { const r = t.rating || '미평가'; if (!map[r]) map[r] = 0; map[r]++; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-bold text-foreground">완료 과제 관리</h1><p className="text-sm text-muted-foreground mt-1">완료된 과제의 성과를 관리하고 분석합니다</p></div>
        </div>
        <PhaseNavigationBar stats={phaseStats} summary={summary} completedSummary={completedSummary} currentPhase="COMPLETED" projectId={projectId} navigate={navigate} />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0"><CheckCircle2 className="w-5 h-5 text-white" /></div><div><p className="text-xs font-bold text-muted-foreground">완료 과제 수</p><p className="text-xl font-bold tabular-nums">{completedSummary.totalCompleted}<span className="text-sm font-normal ml-0.5">건</span></p></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0"><DollarSign className="w-5 h-5 text-white" /></div><div><p className="text-xs font-bold text-muted-foreground">목표 절감액</p><p className="text-xl font-bold tabular-nums">{formatAmount(completedSummary.totalSavingTarget)}</p></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0"><TrendingUp className="w-5 h-5 text-white" /></div><div><p className="text-xs font-bold text-muted-foreground">실제 절감액</p><p className="text-xl font-bold tabular-nums text-green-600">{formatAmount(completedSummary.totalActualSaving)}</p></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0"><Award className="w-5 h-5 text-white" /></div><div><p className="text-xs font-bold text-muted-foreground">목표 달성율</p><p className="text-xl font-bold tabular-nums">{completedSummary.achievementRate}<span className="text-sm font-normal ml-0.5">%</span></p></div></div></CardContent></Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 px-5 pt-4"><CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-muted-foreground" />등급별 분포</CardTitle></CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart><Pie data={ratingChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} label={({ name, value }) => `${name} ${value}`}>{ratingChartData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 px-5 pt-4"><CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-muted-foreground" />부서별 절감 실적</CardTitle></CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={deptChartData} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} /><Tooltip formatter={(v) => [`${v}만원`, '절감액']} /><Bar dataKey="절감액" fill="#10b981" radius={[0, 4, 4, 0]} /></BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3 px-5 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">완료 과제 목록</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative"><Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="과제명, 부서 검색..." value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} className="pl-8 h-8 w-[180px] text-xs" /></div>
                  <Select value={ratingFilter} onValueChange={setRatingFilter}><SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 등급</SelectItem><SelectItem value="A+">A+</SelectItem><SelectItem value="A">A</SelectItem><SelectItem value="B+">B+</SelectItem><SelectItem value="B">B</SelectItem></SelectContent></Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[50px] text-center">No</TableHead>
                      <TableHead>과제명</TableHead><TableHead className="max-w-[120px]">클러스터명</TableHead><TableHead className="max-w-[120px]">세부클러스터명</TableHead><TableHead>담당부서</TableHead><TableHead>컨설턴트</TableHead>
                      <TableHead className="text-right">모수 금액</TableHead><TableHead className="text-right">예상 절감액</TableHead><TableHead className="text-right">실제 절감액</TableHead>
                      <TableHead className="text-center">달성율</TableHead><TableHead className="text-center">등급</TableHead>
                      <TableHead className="text-center w-[120px]">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map((task, idx) => {
                      const achievementRate = task.expectedSavingAmount > 0 ? Math.round((task.actualSaving || 0) / task.expectedSavingAmount * 100) : 0;
                      return (
                        <TableRow key={task.id} className="hover:bg-muted/30">
                          <TableCell className="text-center text-xs tabular-nums">{idx + 1}</TableCell>
                          <TableCell className="text-sm font-medium">{task.taskName}</TableCell>
                          <TableCell className="text-xs max-w-[120px]"><ClusterNames clusters={task.clusters} level={2} /></TableCell>
                          <TableCell className="text-xs max-w-[120px]"><ClusterNames clusters={task.clusters} level={3} /></TableCell>
                          <TableCell className="text-xs">{task.department || '-'}</TableCell>
                          <TableCell className="text-xs">{task.consultant || '-'}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatAmount(task.baseAmount ?? 0)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatAmount(task.expectedSavingAmount ?? 0)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums text-green-600 font-medium">{formatAmount(task.actualSaving ?? 0)}</TableCell>
                          <TableCell className="text-center"><span className={cn('text-xs font-bold tabular-nums', achievementRate >= 100 ? 'text-green-600' : 'text-orange-600')}>{achievementRate}%</span></TableCell>
                          <TableCell className="text-center"><Badge className={cn('text-[10px] px-1.5 border', RATING_MAP[task.rating])}>{task.rating || '-'}</Badge></TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDetailTask(task)} title="상세 보기"><Eye className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditTask(task)} title="수정" disabled={!isEditor}><Edit2 className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDocsTask(task)} title="자료 조회"><FileText className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-orange-500 hover:text-orange-700 hover:bg-orange-50" onClick={() => setResetTask(task)} title="초기화" disabled={!isEditor}><RotateCcw className="w-3 h-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredTasks.length === 0 && <TableRow><TableCell colSpan={12} className="text-center text-sm text-muted-foreground py-8">{tasks.length === 0 ? '완료된 과제가 없습니다.' : '검색 결과가 없습니다.'}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="px-5 py-3 border-t text-xs text-muted-foreground">총 {filteredTasks.length}건 표시 중</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <CompletedTaskDetailModal open={!!detailTask} onClose={() => setDetailTask(null)} task={detailTask} />
      <EditTaskModal open={!!editTask} onClose={() => setEditTask(null)} task={editTask} onSave={handleSaveTask} />
      <DocumentsModal open={!!docsTask} onClose={() => setDocsTask(null)} task={docsTask} projectId={projectId} />

      {/* Reset Confirmation Dialog */}
      <Dialog open={!!resetTask} onOpenChange={() => setResetTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-orange-500" />과제 초기화</DialogTitle>
            <DialogDescription>완료된 과제를 관리 단계로 되돌립니다.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-foreground"><span className="font-semibold">{resetTask?.taskName}</span> 과제를 초기화하시겠습니까?</p>
            <div className="mt-3 p-3 rounded-lg bg-orange-50 border border-orange-200 space-y-1">
              <p className="text-xs text-orange-700 font-medium">초기화 시 다음 항목이 변경됩니다:</p>
              <ul className="text-xs text-orange-600 space-y-0.5 ml-3 list-disc">
                <li>진척율 → 0%</li>
                <li>상태 → "진행 중"</li>
                <li>실제 절감액, 등급 → 초기화</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground mt-2">과제가 "Able 과제 관리" 메뉴로 이동됩니다.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setResetTask(null)} disabled={resetting}>취소</Button>
            <Button className="bg-orange-500 hover:bg-orange-600" onClick={handleResetConfirm} disabled={resetting}>
              {resetting ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />초기화 중...</> : <><RotateCcw className="w-4 h-4 mr-1.5" />초기화</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
