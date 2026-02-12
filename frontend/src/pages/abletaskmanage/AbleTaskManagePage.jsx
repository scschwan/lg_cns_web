import React, { useState } from 'react';
import {
  Search, Edit2, Eye, Trash2, FolderKanban, Filter,
  ArrowUpDown, ChevronRight, MoreHorizontal, TrendingUp,
  DollarSign, ClipboardList, CheckCircle2, Clock, AlertCircle,
  FileText, Link2, FileIcon, ExternalLink, X, Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Checkbox } from '@/components/ui/checkbox';
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

const STATUS_OPTIONS = ['진행 중', '검토 중', '보류', '완료'];

/* ============================================================
   임시 데이터
   ============================================================ */
const TASKS = [
  {
    id: 1, name: '과제 1', majorAccount: '대계정 1', cluster: '서브 클러스터 3',
    department: '구매팀', manager: '박영호', consultant: '이민수',
    baseAmount: 2500000000, savingRate: 3.5, savingAmount: 87500000,
    progress: 65, status: '진행 중', createdAt: '2024-10-15',
    documents: [
      { id: 1, type: 'link', name: 'https://example.com/report-1', label: '분석 보고서' },
      { id: 2, type: 'file', name: 'analysis_01.xlsx', label: '분석자료.xlsx' },
      { id: 3, type: 'file', name: 'summary_01.pdf', label: '요약보고서.pdf' },
    ],
  },
  {
    id: 2, name: '과제 2', majorAccount: '대계정 1', cluster: '서브 클러스터 5',
    department: '생산팀', manager: '김수현', consultant: '정하나',
    baseAmount: 1800000000, savingRate: 2.8, savingAmount: 50400000,
    progress: 40, status: '진행 중', createdAt: '2024-10-20',
    documents: [
      { id: 1, type: 'link', name: 'https://example.com/production-data', label: '생산 데이터 링크' },
      { id: 2, type: 'file', name: 'production_analysis.xlsx', label: '생산분석자료.xlsx' },
      { id: 3, type: 'link', name: 'https://example.com/benchmark', label: '벤치마크 보고서' },
      { id: 4, type: 'file', name: 'cost_breakdown.pdf', label: '원가분석.pdf' },
      { id: 5, type: 'file', name: 'meeting_notes.docx', label: '회의록.docx' },
    ],
  },
  {
    id: 3, name: '과제 3', majorAccount: '대계정 2', cluster: '서브 클러스터 8',
    department: '관리팀', manager: '최유진', consultant: '이민수',
    baseAmount: 3200000000, savingRate: 4.2, savingAmount: 134400000,
    progress: 85, status: '검토 중', createdAt: '2024-11-01',
    documents: [
      { id: 1, type: 'link', name: 'https://example.com/review-docs', label: '검토 자료 링크' },
      { id: 2, type: 'file', name: 'review_report.pdf', label: '검토보고서.pdf' },
      { id: 3, type: 'file', name: 'financial_model.xlsx', label: '재무모델.xlsx' },
      { id: 4, type: 'link', name: 'https://example.com/competitor-analysis', label: '경쟁사 분석' },
      { id: 5, type: 'file', name: 'risk_assessment.docx', label: '리스크평가.docx' },
      { id: 6, type: 'file', name: 'timeline.xlsx', label: '일정표.xlsx' },
      { id: 7, type: 'link', name: 'https://example.com/industry-report', label: '산업 보고서' },
    ],
  },
  {
    id: 4, name: '과제 4', majorAccount: '대계정 2, 대계정 3', cluster: '서브 클러스터 7, 11',
    department: '경영지원실', manager: '김민수', consultant: '이민수',
    baseAmount: 1370000000, savingRate: 2.0, savingAmount: 27400000,
    progress: 0, status: '진행 중', createdAt: '2024-11-10',
    documents: [
      { id: 1, type: 'link', name: 'https://example.com/initial-plan', label: '초기 계획서 링크' },
      { id: 2, type: 'file', name: 'project_plan.pdf', label: '프로젝트계획서.pdf' },
      { id: 3, type: 'file', name: 'budget_draft.xlsx', label: '예산안(초안).xlsx' },
      { id: 4, type: 'link', name: 'https://example.com/org-chart', label: '조직도 참고' },
      { id: 5, type: 'file', name: 'stakeholders.docx', label: '이해관계자목록.docx' },
    ],
  },
  {
    id: 5, name: '과제 5', majorAccount: '대계정 3', cluster: '서브 클러스터 12',
    department: '영업팀', manager: '이정원', consultant: '정하나',
    baseAmount: 950000000, savingRate: 1.5, savingAmount: 14250000,
    progress: 20, status: '보류', createdAt: '2024-11-15',
    documents: [
      { id: 1, type: 'file', name: 'sales_data.xlsx', label: '영업데이터.xlsx' },
      { id: 2, type: 'link', name: 'https://example.com/hold-reason', label: '보류 사유 문서' },
    ],
  },
  {
    id: 6, name: '과제 6', majorAccount: '대계정 1', cluster: '서브 클러스터 2',
    department: '구매팀', manager: '박영호', consultant: '김태호',
    baseAmount: 4100000000, savingRate: 5.0, savingAmount: 205000000,
    progress: 100, status: '완료', createdAt: '2024-09-20',
    documents: [
      { id: 1, type: 'link', name: 'https://example.com/final-report', label: '최종 보고서' },
      { id: 2, type: 'file', name: 'final_analysis.xlsx', label: '최종분석자료.xlsx' },
      { id: 3, type: 'file', name: 'savings_proof.pdf', label: '절감증빙.pdf' },
      { id: 4, type: 'link', name: 'https://example.com/presentation', label: '발표자료 링크' },
      { id: 5, type: 'file', name: 'approval_doc.pdf', label: '승인문서.pdf' },
      { id: 6, type: 'file', name: 'contract_amendment.docx', label: '계약변경서.docx' },
      { id: 7, type: 'link', name: 'https://example.com/vendor-portal', label: '공급사 포탈' },
      { id: 8, type: 'file', name: 'implementation_log.xlsx', label: '이행실적표.xlsx' },
      { id: 9, type: 'file', name: 'lesson_learned.pdf', label: '교훈보고서.pdf' },
      { id: 10, type: 'link', name: 'https://example.com/archive', label: '아카이브 링크' },
    ],
  },
  {
    id: 7, name: '과제 7', majorAccount: '대계정 4', cluster: '서브 클러스터 15',
    department: '기획팀', manager: '한소영', consultant: '김태호',
    baseAmount: 2800000000, savingRate: 3.0, savingAmount: 84000000,
    progress: 55, status: '진행 중', createdAt: '2024-11-25',
    documents: [
      { id: 1, type: 'link', name: 'https://example.com/strategy-doc', label: '전략문서 링크' },
      { id: 2, type: 'file', name: 'strategy_plan.pptx', label: '전략기획안.pptx' },
      { id: 3, type: 'file', name: 'market_research.pdf', label: '시장조사보고서.pdf' },
      { id: 4, type: 'link', name: 'https://example.com/kpi-dashboard', label: 'KPI 대시보드' },
    ],
  },
  {
    id: 8, name: '과제 8', majorAccount: '대계정 5', cluster: '서브 클러스터 20',
    department: '연구팀', manager: '송재원', consultant: '정하나',
    baseAmount: 1600000000, savingRate: 2.5, savingAmount: 40000000,
    progress: 30, status: '진행 중', createdAt: '2024-12-01',
    documents: [
      { id: 1, type: 'file', name: 'research_data.xlsx', label: '연구데이터.xlsx' },
      { id: 2, type: 'link', name: 'https://example.com/lab-results', label: '실험결과 링크' },
      { id: 3, type: 'file', name: 'patent_review.pdf', label: '특허검토서.pdf' },
    ],
  },
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
   Task Detail Modal (과제 상세)
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
              <span className="font-semibold tabular-nums">{task.documents.length}건</span>
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
   Task Edit Modal (과제 수정)
   ============================================================ */
function TaskEditModal({ open, onClose, task, onSave }) {
  const [form, setForm] = useState({});

  React.useEffect(() => {
    if (task) {
      setForm({
        name: task.name,
        majorAccount: task.majorAccount,
        department: task.department,
        consultant: task.consultant,
        baseAmount: task.baseAmount,
        savingRate: task.savingRate,
        savingAmount: task.savingAmount,
        progress: task.progress,
        status: task.status,
      });
    }
  }, [task]);

  if (!task) return null;

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave({ ...task, ...form });
    onClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-5 h-5 text-orange-600" />
            과제 수정
          </DialogTitle>
          <DialogDescription>과제 정보를 수정합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* 과제명 */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">과제명</Label>
            <Input
              id="edit-name"
              value={form.name || ''}
              onChange={e => handleChange('name', e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* 대계정 / 담당부서 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-majorAccount">대계정</Label>
              <Input
                id="edit-majorAccount"
                value={form.majorAccount || ''}
                onChange={e => handleChange('majorAccount', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-department">담당부서</Label>
              <Input
                id="edit-department"
                value={form.department || ''}
                onChange={e => handleChange('department', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* 컨설턴트 */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-consultant">컨설턴트</Label>
            <Input
              id="edit-consultant"
              value={form.consultant || ''}
              onChange={e => handleChange('consultant', e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* 모수금액 / 절감율 / 절감액 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-baseAmount">모수금액</Label>
              <Input
                id="edit-baseAmount"
                type="number"
                value={form.baseAmount ?? ''}
                onChange={e => handleChange('baseAmount', Number(e.target.value))}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-savingRate">절감율 (%)</Label>
              <Input
                id="edit-savingRate"
                type="number"
                step="0.1"
                value={form.savingRate ?? ''}
                onChange={e => handleChange('savingRate', Number(e.target.value))}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-savingAmount">절감액</Label>
              <Input
                id="edit-savingAmount"
                type="number"
                value={form.savingAmount ?? ''}
                onChange={e => handleChange('savingAmount', Number(e.target.value))}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* 진척율 / 상태 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-progress">진척율 (%)</Label>
              <Input
                id="edit-progress"
                type="number"
                min={0}
                max={100}
                value={form.progress ?? ''}
                onChange={e => handleChange('progress', Number(e.target.value))}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>상태</Label>
              <Select value={form.status || ''} onValueChange={v => handleChange('status', v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onClose(false)}>
            <X className="w-4 h-4 mr-1.5" />
            취소
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-1.5" />
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Task Documents Modal (자료 조회)
   ============================================================ */
function TaskDocumentsModal({ open, onClose, task }) {
  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            자료 조회 - {task.name}
          </DialogTitle>
          <DialogDescription>등록된 자료 목록을 확인합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {task.documents.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              등록된 자료가 없습니다.
            </div>
          )}
          {task.documents.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors"
            >
              {/* Type Icon */}
              <div className={cn(
                'w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0',
                doc.type === 'link' ? 'bg-blue-100' : 'bg-green-100'
              )}>
                {doc.type === 'link'
                  ? <Link2 className="w-4 h-4 text-blue-600" />
                  : <FileIcon className="w-4 h-4 text-green-600" />
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.label}</p>
                <p className="text-xs text-muted-foreground truncate">{doc.name}</p>
              </div>

              {/* Badge */}
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] flex-shrink-0',
                  doc.type === 'link' ? 'border-blue-300 text-blue-600' : 'border-green-300 text-green-600'
                )}
              >
                {doc.type === 'link' ? '링크' : '파일'}
              </Badge>

              {/* External Link for links */}
              {doc.type === 'link' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 flex-shrink-0"
                  onClick={() => window.open(doc.name, '_blank')}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-muted-foreground">
              총 {task.documents.length}건의 자료
            </span>
            <Button variant="outline" onClick={() => onClose(false)}>닫기</Button>
          </div>
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
  const [editTask, setEditTask] = useState(null);
  const [docsTask, setDocsTask] = useState(null);
  const [tasks, setTasks] = useState(TASKS);

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (searchKeyword && !t.name.includes(searchKeyword) && !t.department.includes(searchKeyword) && !t.manager.includes(searchKeyword)) return false;
    return true;
  });

  const handleEditSave = (updatedTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };

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
                      <TableHead className="text-center w-[110px]">관리</TableHead>
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
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDetailTask(task)} title="상세 보기">
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditTask(task)} title="과제 수정">
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDocsTask(task)} title="자료 조회">
                                <FileText className="w-3 h-3" />
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

      {/* Edit Modal */}
      <TaskEditModal open={!!editTask} onClose={() => setEditTask(null)} task={editTask} onSave={handleEditSave} />

      {/* Documents Modal */}
      <TaskDocumentsModal open={!!docsTask} onClose={() => setDocsTask(null)} task={docsTask} />
    </div>
  );
}
