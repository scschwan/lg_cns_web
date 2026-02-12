import React, { useState, useMemo } from 'react';
import {
  ChevronRight, ChevronDown, FilePlus, Eye, FileSpreadsheet,
  Filter, Link2, FileIcon, Plus, Trash2, Upload, ExternalLink, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  {
    id: '3',
    name: '인건비',
    coObjectCount: 12,
    offsetAccountCount: 4,
    totalAmount: 7200000000,
    items: 2,
    children: [
      { id: '3-1', name: '급여', coObjectCount: 5, offsetAccountCount: 2, totalAmount: 4500000000, items: 1 },
      { id: '3-2', name: '상여금', coObjectCount: 4, offsetAccountCount: 1, totalAmount: 1800000000, items: 1 },
      { id: '3-3', name: '퇴직급여', coObjectCount: 3, offsetAccountCount: 1, totalAmount: 900000000, items: 0 },
    ],
  },
  {
    id: '4',
    name: '외주비',
    coObjectCount: 8,
    offsetAccountCount: 2,
    totalAmount: 4300000000,
    items: 1,
    children: [
      { id: '4-1', name: '용역비', coObjectCount: 5, offsetAccountCount: 1, totalAmount: 2800000000, items: 1 },
      { id: '4-2', name: '유지보수비', coObjectCount: 3, offsetAccountCount: 1, totalAmount: 1500000000, items: 0 },
    ],
  },
];

/* ============================================================
   금액 포맷
   ============================================================ */
const formatAmount = (v) => {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (v >= 10000) return (v / 10000).toFixed(0) + '만';
  return v.toLocaleString();
};

/* ============================================================
   링크 추가 Dialog
   ============================================================ */
function LinkAddDialog({ open, onClose, onAdd }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  const handleAdd = () => {
    if (!url.trim()) return;
    onAdd({
      id: Date.now(),
      type: 'link',
      name: url.trim(),
      label: label.trim() || url.trim(),
    });
    setUrl('');
    setLabel('');
    onClose(false);
  };

  const handleOpenChange = (val) => {
    if (!val) {
      setUrl('');
      setLabel('');
    }
    onClose(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-600" />
            링크 추가
          </DialogTitle>
          <DialogDescription>참고 링크의 URL과 표시 라벨을 입력하세요.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">라벨 (선택)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="링크 설명을 입력하세요"
              className="h-9 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>취소</Button>
          <Button size="sm" onClick={handleAdd} disabled={!url.trim()}>
            <Plus className="w-4 h-4 mr-1" />추가
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   파일 업로드 Dialog
   ============================================================ */
function FileUploadDialog({ open, onClose, onUpload }) {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (fileList) => {
    const arr = Array.from(fileList);
    setFiles((prev) => [...prev, ...arr]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleUpload = () => {
    if (files.length === 0) return;
    const docs = files.map((f, i) => ({
      id: Date.now() + i,
      type: 'file',
      name: f.name,
      label: f.name,
    }));
    onUpload(docs);
    setFiles([]);
    onClose(false);
  };

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleOpenChange = (val) => {
    if (!val) {
      setFiles([]);
      setIsDragging(false);
    }
    onClose(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-green-600" />
            파일 업로드
          </DialogTitle>
          <DialogDescription>파일을 드래그하거나 선택하여 업로드하세요.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            )}
            onClick={() => document.getElementById('file-upload-input')?.click()}
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">파일을 여기에 끌어다 놓으세요</p>
            <p className="text-xs text-muted-foreground mt-1">또는 클릭하여 파일을 선택하세요</p>
            <input
              id="file-upload-input"
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files.length > 0) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">선택된 파일 ({files.length})</p>
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30 text-sm">
                  <FileIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFile(idx)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => document.getElementById('file-upload-input')?.click()}
          >
            <Plus className="w-4 h-4 mr-1" />파일 선택
          </Button>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>취소</Button>
          <Button size="sm" onClick={handleUpload} disabled={files.length === 0}>
            <Upload className="w-4 h-4 mr-1" />업로드
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Tree Row (with checkbox)
   ============================================================ */
function TreeRow({ item, level = 0, expandedIds, toggleExpand, checkedIds, onCheckChange }) {
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);
  const isChecked = checkedIds.has(item.id);
  const paddingLeft = 16 + level * 24;

  // For parent rows, determine indeterminate state
  const isIndeterminate = hasChildren && !isChecked &&
    item.children.some((child) => checkedIds.has(child.id));

  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer transition-colors hover:bg-muted/40',
          level === 0 && 'bg-muted/30 font-medium',
          isChecked && 'bg-primary/5'
        )}
      >
        <TableCell style={{ paddingLeft }} className="py-2.5">
          <div className="flex items-center gap-2">
            {/* Expand / Collapse toggle */}
            {hasChildren ? (
              <span
                className="w-4 h-4 flex items-center justify-center flex-shrink-0"
                onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
              >
                {isExpanded
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </span>
            ) : (
              <span className="w-4 h-4 flex-shrink-0" />
            )}

            {/* Checkbox */}
            <Checkbox
              checked={isIndeterminate ? 'indeterminate' : isChecked}
              onCheckedChange={(checked) => onCheckChange(item, level, !!checked)}
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0"
            />

            <span
              className={cn(level === 0 ? 'font-semibold' : '')}
              onClick={() => hasChildren && toggleExpand(item.id)}
            >
              {item.name}
            </span>
            {level === 0 && hasChildren && (
              <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">{item.children.length}</Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{item.coObjectCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{item.offsetAccountCount.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5 font-medium">{formatAmount(item.totalAmount)}</TableCell>
        <TableCell className="text-center tabular-nums py-2.5">
          {item.items > 0
            ? <Badge variant="secondary" className="text-[10px]">{item.items}</Badge>
            : <span className="text-muted-foreground text-xs">-</span>}
        </TableCell>
      </TableRow>
      {isExpanded && hasChildren && item.children.map((child) => (
        <TreeRow
          key={child.id}
          item={child}
          level={level + 1}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          checkedIds={checkedIds}
          onCheckChange={onCheckChange}
        />
      ))}
    </>
  );
}

/* ============================================================
   메인 AbleTaskRegisterPage
   ============================================================ */
export default function AbleTaskRegisterPage() {
  const [currentLevel, setCurrentLevel] = useState(2);
  const [expandedIds, setExpandedIds] = useState(new Set(['1']));

  // Dialog states
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);

  // Checkbox state: set of checked item IDs
  const [checkedIds, setCheckedIds] = useState(new Set());

  // Form state
  const [taskName, setTaskName] = useState('');
  const [department, setDepartment] = useState('');
  const [manager, setManager] = useState('');
  const [consultant, setConsultant] = useState('');
  const [baseAmount, setBaseAmount] = useState('');
  const [expectedSavingRate, setExpectedSavingRate] = useState('');
  const [expectedSavingAmount, setExpectedSavingAmount] = useState('');
  const [progressRate, setProgressRate] = useState(0);
  const [status, setStatus] = useState('진행 중');

  // Documents (links + files)
  const [documents, setDocuments] = useState([]);

  // ---- Checkbox logic ----
  const onCheckChange = (item, level, checked) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);

      if (level === 0) {
        // Parent item: toggle self + all children
        if (checked) {
          next.add(item.id);
          if (item.children) {
            item.children.forEach((child) => next.add(child.id));
          }
          // Auto-expand so children are visible
          setExpandedIds((prevExp) => {
            const nextExp = new Set(prevExp);
            nextExp.add(item.id);
            return nextExp;
          });
        } else {
          next.delete(item.id);
          if (item.children) {
            item.children.forEach((child) => next.delete(child.id));
          }
        }
      } else {
        // Child item
        if (checked) {
          next.add(item.id);
          // Find parent and check if all children are now checked -> auto-check parent
          const parent = TREE_DATA.find((p) =>
            p.children && p.children.some((c) => c.id === item.id)
          );
          if (parent) {
            const allChildrenChecked = parent.children.every((c) => next.has(c.id));
            if (allChildrenChecked) {
              next.add(parent.id);
            } else {
              // At least one child is checked, so parent should appear in 대계정명
              // We add parent id to track it, even if not all children checked
              // Actually, for 대계정명, we derive from which parents have any checked children.
              // So we don't need to force-add parent here. Derived state handles it.
            }
          }
        } else {
          next.delete(item.id);
          // Uncheck parent if it was fully checked
          const parent = TREE_DATA.find((p) =>
            p.children && p.children.some((c) => c.id === item.id)
          );
          if (parent) {
            // If no children remain checked, remove parent too
            const anyChildChecked = parent.children.some((c) => next.has(c.id));
            if (!anyChildChecked) {
              next.delete(parent.id);
            } else {
              // Some children remain, so parent stays as partially checked
              // Remove the "all checked" state
              next.delete(parent.id);
            }
          }
        }
      }

      return next;
    });
  };

  // Derive 관련 대계정명 and 관련 클러스터명 from checked IDs
  const selectedMajorAccounts = useMemo(() => {
    const accounts = [];
    TREE_DATA.forEach((parent) => {
      const hasAnyChildChecked = parent.children && parent.children.some((c) => checkedIds.has(c.id));
      const parentDirectlyChecked = checkedIds.has(parent.id);
      if (parentDirectlyChecked || hasAnyChildChecked) {
        accounts.push(parent.name);
      }
    });
    return accounts;
  }, [checkedIds]);

  const selectedClusters = useMemo(() => {
    const clusters = [];
    TREE_DATA.forEach((parent) => {
      if (parent.children) {
        parent.children.forEach((child) => {
          if (checkedIds.has(child.id)) {
            clusters.push(child.name);
          }
        });
      }
    });
    return clusters;
  }, [checkedIds]);

  // ---- Document management ----
  const handleAddLink = (doc) => {
    setDocuments((prev) => [...prev, doc]);
  };

  const handleUploadFiles = (docs) => {
    setDocuments((prev) => [...prev, ...docs]);
  };

  const handleDeleteDocument = (docId) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  // ---- Tree helpers ----
  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2"
                      onClick={() => setExpandedIds(new Set(TREE_DATA.map((i) => i.id)))}
                    >
                      모두 펼치기
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2"
                      onClick={() => setExpandedIds(new Set())}
                    >
                      모두 접기
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="pl-4">데이터 (비용유형분류)</TableHead>
                        <TableHead className="text-right w-[110px]">코스트센터 수</TableHead>
                        <TableHead className="text-right w-[110px]">공급업체 수</TableHead>
                        <TableHead className="text-right w-[130px]">합계 금액</TableHead>
                        <TableHead className="text-center w-[80px]">항목</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {TREE_DATA.map((item) => (
                        <TreeRow
                          key={item.id}
                          item={item}
                          expandedIds={expandedIds}
                          toggleExpand={toggleExpand}
                          checkedIds={checkedIds}
                          onCheckChange={onCheckChange}
                        />
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
                    <Filter className="w-4 h-4 mr-1" />필터링
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
              <Input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="과제명을 입력하세요"
                className="h-9 text-sm"
              />
            </div>

            {/* 관련 대계정명 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">관련 대계정명</Label>
              <div className="min-h-[36px] flex flex-wrap gap-1.5 p-2 rounded-md border bg-muted/20">
                {selectedMajorAccounts.length > 0 ? (
                  selectedMajorAccounts.map((name) => (
                    <Badge key={name} variant="secondary" className="text-xs gap-1">
                      {name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">좌측 트리에서 항목을 선택하세요</span>
                )}
              </div>
            </div>

            {/* 관련 클러스터명 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">관련 클러스터명</Label>
              <div className="min-h-[36px] flex flex-wrap gap-1.5 p-2 rounded-md border bg-muted/20">
                {selectedClusters.length > 0 ? (
                  selectedClusters.map((name) => (
                    <Badge key={name} variant="secondary" className="text-xs gap-1">
                      {name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">좌측 트리에서 항목을 선택하세요</span>
                )}
              </div>
            </div>

            {/* 고객사 담당부서 / 담당자명 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">고객사 담당부서</Label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="담당부서"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">담당자명</Label>
                <Input
                  value={manager}
                  onChange={(e) => setManager(e.target.value)}
                  placeholder="담당자명"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* 담당 컨설턴트 명 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">담당 컨설턴트 명</Label>
              <Input
                value={consultant}
                onChange={(e) => setConsultant(e.target.value)}
                placeholder="컨설턴트 명"
                className="h-9 text-sm"
              />
            </div>

            {/* 모수 금액 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">모수 금액</Label>
              <Input
                value={baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
                placeholder="0"
                className="h-9 text-sm text-right tabular-nums"
              />
            </div>

            {/* 예상 절감율 / 예상 절감액 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">예상 절감율 (%)</Label>
                <Input
                  value={expectedSavingRate}
                  onChange={(e) => setExpectedSavingRate(e.target.value)}
                  placeholder="0.0"
                  className="h-9 text-sm text-right tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">예상 절감액</Label>
                <Input
                  value={expectedSavingAmount}
                  onChange={(e) => setExpectedSavingAmount(e.target.value)}
                  placeholder="0"
                  className="h-9 text-sm text-right tabular-nums"
                />
              </div>
            </div>

            {/* 진척율 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">진척율 (%)</Label>
              <div className="flex items-center gap-3">
                <Progress value={progressRate} className="flex-1 h-2" />
                <span className="text-sm font-semibold tabular-nums w-12 text-right">{progressRate}%</span>
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
                <span className="text-[10px] text-muted-foreground">총 {documents.length}건</span>
              </div>
              <div className="border rounded-lg bg-muted/30">
                {documents.length > 0 ? (
                  <div className="divide-y">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 px-3 py-2 group">
                        {doc.type === 'link' ? (
                          <Link2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        ) : (
                          <FileIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{doc.label}</p>
                          {doc.type === 'link' && (
                            <p className="text-[10px] text-muted-foreground truncate">{doc.name}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[9px] flex-shrink-0 px-1 py-0">
                          {doc.type === 'link' ? '링크' : '파일'}
                        </Badge>
                        {doc.type === 'link' && (
                          <a
                            href={doc.name}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex-shrink-0"
                          >
                            <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          onClick={() => handleDeleteDocument(doc.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center">
                    <FileIcon className="w-6 h-6 mx-auto text-muted-foreground/40 mb-1" />
                    <p className="text-xs text-muted-foreground">등록된 자료가 없습니다</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 flex-1"
                  onClick={() => setLinkDialogOpen(true)}
                >
                  <Link2 className="w-3 h-3 mr-1" />링크 추가
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 flex-1"
                  onClick={() => setFileDialogOpen(true)}
                >
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

      {/* Dialogs */}
      <LinkAddDialog
        open={linkDialogOpen}
        onClose={setLinkDialogOpen}
        onAdd={handleAddLink}
      />
      <FileUploadDialog
        open={fileDialogOpen}
        onClose={setFileDialogOpen}
        onUpload={handleUploadFiles}
      />
    </div>
  );
}
