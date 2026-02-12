import React, { useState, useMemo } from 'react';
import {
  ChevronRight, ChevronDown, FilePlus, Eye, FileSpreadsheet,
  Filter, Link2, FileIcon, Plus, Trash2, Upload, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

/* ============================================================
   임시 데이터
   ============================================================ */
const LEVELS = [
  { id: 1, label: '레벨 1', subClusterCount: 38, totalAmount: 95.0 },
  { id: 2, label: '레벨 2', subClusterCount: 12, totalAmount: 28.5 },
  { id: 3, label: '레벨 3', subClusterCount: 5, totalAmount: 13.7 },
];

const TREE_DATA = [
  {
    id: '1',
    name: '간접비',
    coObjectCount: 15,
    offsetAccountCount: 5,
    totalAmount: 8500000000,
    items: 3,
    children: [
      { id: '1-1', name: '복리후생비', coObjectCount: 5, offsetAccountCount: 2, totalAmount: 3200000000, items: 1 },
      { id: '1-2', name: '여비교통비', coObjectCount: 4, offsetAccountCount: 1, totalAmount: 2100000000, items: 1 },
      { id: '1-3', name: '통신비', coObjectCount: 3, offsetAccountCount: 1, totalAmount: 1800000000, items: 1 },
      { id: '1-4', name: '수도광열비', coObjectCount: 3, offsetAccountCount: 1, totalAmount: 1400000000, items: 0 },
    ],
  },
  {
    id: '2',
    name: '감가상각비',
    coObjectCount: 10,
    offsetAccountCount: 3,
    totalAmount: 6100000000,
    items: 2,
    children: [
      { id: '2-1', name: '건물감가상각비', coObjectCount: 4, offsetAccountCount: 1, totalAmount: 2800000000, items: 1 },
      { id: '2-2', name: '기계장치감가상각비', coObjectCount: 6, offsetAccountCount: 2, totalAmount: 3300000000, items: 1 },
    ],
  },
];

const MOCK_TASK = {
  taskName: '과제 4',
  majorAccounts: ['대계정 2', '대계정 3'],
  clusters: ['서브 클러스터 7', '서브 클러스터 11'],
  department: '경영지원실',
  manager: '김민수',
  consultant: '이민수',
  baseAmount: 1370000000,
  expectedSavingRate: 2.0,
  expectedSavingAmount: 27400000,
  progressRate: 0,
  status: '진행 중',
  documents: [
    { id: 1, type: 'link', name: 'https://www.google.com/search?q=cost+optimization', label: '구글 검색 결과' },
    { id: 2, type: 'file', name: '/Users/designer/Desktop/분석자료1.xlsx', label: '분석자료1.xlsx' },
    { id: 3, type: 'file', name: '/Users/designer/Desktop/분석자료2.pdf', label: '분석자료2.pdf' },
    { id: 4, type: 'file', name: '/Users/designer/Desktop/참고자료.docx', label: '참고자료.docx' },
    { id: 5, type: 'link', name: 'https://www.google.com/search?q=benchmarking', label: '벤치마킹 참고' },
  ],
};

/* ============================================================
   금액 포맷
   ============================================================ */
const formatAmount = (v) => {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (v >= 10000) return (v / 10000).toFixed(0) + '만';
  return v.toLocaleString();
};

/* ============================================================
   Tree Row
   ============================================================ */
function TreeRow({ item, level = 0, expandedIds, toggleExpand }) {
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);
  const paddingLeft = 16 + level * 24;
  return (
    <>
      <TableRow
        className={cn('cursor-pointer transition-colors', level === 0 && 'bg-muted/30 font-medium')}
        onClick={() => hasChildren && toggleExpand(item.id)}
      >
        <TableCell style={{ paddingLeft }} className="py-2.5">
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </span>
            ) : <span className="w-4 h-4 flex-shrink-0" />}
            <span className={cn(level === 0 ? 'font-semibold' : '')}>{item.name}</span>
            {level === 0 && hasChildren && (
              <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">{item.children.length}</Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{item.coObjectCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{item.offsetAccountCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5 font-medium">{formatAmount(item.totalAmount)}</TableCell>
        <TableCell className="text-center tabular-nums py-2.5">
          {item.items > 0 ? <Badge variant="secondary" className="text-[10px]">{item.items}</Badge> : <span className="text-muted-foreground text-xs">-</span>}
        </TableCell>
      </TableRow>
      {isExpanded && hasChildren && item.children.map(child => (
        <TreeRow key={child.id} item={child} level={level + 1} expandedIds={expandedIds} toggleExpand={toggleExpand} />
      ))}
    </>
  );
}

/* ============================================================
   자료 목록 Modal
   ============================================================ */
function DocumentListModal({ open, onClose, documents }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileIcon className="w-5 h-5 text-blue-600" />
            자료 목록 자세히 보기
          </DialogTitle>
          <DialogDescription>등록된 자료 총 {documents.length}개</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                {doc.type === 'link' ? (
                  <Link2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                ) : (
                  <FileIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{doc.name}</p>
                </div>
                <Badge variant="outline" className="text-[10px] flex-shrink-0">
                  {doc.type === 'link' ? '링크' : '파일'}
                </Badge>
                {doc.type === 'link' && (
                  <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            ))}
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
   메인 AbleTaskRegisterPage
   ============================================================ */
export default function AbleTaskRegisterPage() {
  const [currentLevel, setCurrentLevel] = useState(2);
  const [expandedIds, setExpandedIds] = useState(new Set(['1']));
  const [documentModal, setDocumentModal] = useState(false);

  // Form state
  const [taskName, setTaskName] = useState(MOCK_TASK.taskName);
  const [status, setStatus] = useState(MOCK_TASK.status);

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

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ===== Header ===== */}
      <div className="flex-shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Able 과제 등록</h1>
            <p className="text-sm text-muted-foreground mt-1">과제를 등록하고 관련 자료를 관리합니다</p>
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

      {/* ===== Main Content ===== */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Tree Table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
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
                        <TableHead className="text-right w-[110px]">CO오브젝트 수</TableHead>
                        <TableHead className="text-right w-[110px]">상계계정 수</TableHead>
                        <TableHead className="text-right w-[130px]">합계 금액</TableHead>
                        <TableHead className="text-center w-[80px]">항목</TableHead>
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
                        <TableCell className="py-3" />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div className="px-5 py-3 border-t flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <FileSpreadsheet className="w-4 h-4 mr-1" />Raw Data 조회
                  </Button>
                  <Button variant="outline" size="sm">
                    <Filter className="w-4 h-4 mr-1" />2개 필터링
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right: Task Registration Form */}
        <div className="w-[420px] border-l bg-card overflow-y-auto flex-shrink-0">
          <div className="p-5 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b">
              <FilePlus className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">내 과제 등록하기</h2>
            </div>

            {/* 과제명 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">과제명</Label>
              <Input value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="과제명을 입력하세요" className="h-9 text-sm" />
            </div>

            {/* 관련 대계정명 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">관련 대계정명</Label>
              <div className="flex flex-wrap gap-1.5">
                {MOCK_TASK.majorAccounts.map((a, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
                ))}
              </div>
            </div>

            {/* 관련 클러스터명 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">관련 클러스터명</Label>
              <div className="flex flex-wrap gap-1.5">
                {MOCK_TASK.clusters.map((c, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                ))}
              </div>
            </div>

            {/* 고객사 담당부서/담당자명 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">고객사 담당부서</Label>
                <Input value={MOCK_TASK.department} readOnly className="h-9 text-sm bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">담당자명</Label>
                <Input value={MOCK_TASK.manager} readOnly className="h-9 text-sm bg-muted/50" />
              </div>
            </div>

            {/* 담당 컨설턴트 명 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">담당 컨설턴트 명</Label>
              <Input value={MOCK_TASK.consultant} readOnly className="h-9 text-sm bg-muted/50" />
            </div>

            {/* 모수 금액 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">모수 금액</Label>
              <Input value={MOCK_TASK.baseAmount.toLocaleString()} readOnly className="h-9 text-sm bg-muted/50 text-right tabular-nums" />
            </div>

            {/* 예상 절감율 / 예상 절감액 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">예상 절감율 (%)</Label>
                <Input value={MOCK_TASK.expectedSavingRate} readOnly className="h-9 text-sm bg-muted/50 text-right tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">예상 절감액</Label>
                <Input value={MOCK_TASK.expectedSavingAmount.toLocaleString()} readOnly className="h-9 text-sm bg-muted/50 text-right tabular-nums" />
              </div>
            </div>

            {/* 진척율 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">진척율 (%)</Label>
              <div className="flex items-center gap-3">
                <Progress value={MOCK_TASK.progressRate} className="flex-1 h-2" />
                <span className="text-sm font-semibold tabular-nums w-12 text-right">{MOCK_TASK.progressRate}%</span>
              </div>
            </div>

            {/* 진행 상태 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">진행 상태</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="진행 중">진행 중</SelectItem>
                  <SelectItem value="검토 중">검토 중</SelectItem>
                  <SelectItem value="보류">보류</SelectItem>
                  <SelectItem value="완료">완료</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 자료 목록 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">자료 목록</Label>
                <Button variant="ghost" size="sm" className="text-[10px] text-blue-600 h-6 px-1.5" onClick={() => setDocumentModal(true)}>
                  <Eye className="w-3 h-3 mr-0.5" />자세히 보기
                </Button>
              </div>
              <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <p className="text-xs text-muted-foreground">등록된 자료 총 {MOCK_TASK.documents.length}개</p>
                {MOCK_TASK.documents.slice(0, 3).map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 text-xs">
                    {doc.type === 'link' ? <Link2 className="w-3 h-3 text-blue-500" /> : <FileIcon className="w-3 h-3 text-green-500" />}
                    <span className="truncate">{doc.label}</span>
                  </div>
                ))}
                {MOCK_TASK.documents.length > 3 && (
                  <p className="text-[10px] text-muted-foreground">외 {MOCK_TASK.documents.length - 3}건</p>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button variant="outline" size="sm" className="text-xs h-7 flex-1">
                  <Link2 className="w-3 h-3 mr-1" />링크 추가
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-7 flex-1">
                  <Upload className="w-3 h-3 mr-1" />파일 업로드
                </Button>
              </div>
            </div>

            {/* 과제 등록 버튼 */}
            <Button className="w-full h-10">
              <FilePlus className="w-4 h-4 mr-2" />
              과제 등록
            </Button>
          </div>
        </div>
      </div>

      {/* Modal */}
      <DocumentListModal
        open={documentModal}
        onClose={() => setDocumentModal(false)}
        documents={MOCK_TASK.documents}
      />
    </div>
  );
}
