import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, FilePlus, FileSpreadsheet,
  Link2, FileIcon, Plus, Trash2, Upload, ExternalLink, X, Loader2,
  ArrowRight, ArrowLeft, CheckCircle2,
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
import costReductionService from '@/services/costReductionService';
import { useEditorLock } from '@/hooks/useEditorLock';
import { useDashboardStatus } from '@/hooks/useDashboardStatus';

const formatAmount = (v) => {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (v >= 10000) return (v / 10000).toFixed(0) + '만';
  return v?.toLocaleString() ?? '0';
};

/* ====== Link Add Dialog ====== */
function LinkAddDialog({ open, onClose, onAdd }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  const handleAdd = () => {
    if (!url.trim()) return;
    onAdd({ url: url.trim(), label: label.trim() || url.trim() });
    setUrl(''); setLabel('');
    onClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) { setUrl(''); setLabel(''); } onClose(val); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="w-5 h-5 text-blue-600" />링크 추가</DialogTitle>
          <DialogDescription>참고 링크의 URL과 표시 라벨을 입력하세요.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">URL</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">라벨 (선택)</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="링크 설명" className="h-9 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" size="sm" onClick={() => onClose(false)}>취소</Button>
          <Button size="sm" onClick={handleAdd} disabled={!url.trim()}><Plus className="w-4 h-4 mr-1" />추가</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ====== File Upload Dialog ====== */
function FileUploadDialog({ open, onClose, onUpload }) {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (fileList) => setFiles(prev => [...prev, ...Array.from(fileList)]);
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleUpload = () => {
    if (files.length === 0) return;
    onUpload(files);
    setFiles([]);
    onClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) { setFiles([]); } onClose(val); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5 text-green-600" />파일 업로드</DialogTitle>
          <DialogDescription>파일을 드래그하거나 선택하여 업로드하세요.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
            onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
            className={cn('border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer', isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50')}
            onClick={() => document.getElementById('file-upload-input')?.click()}
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">파일을 여기에 끌어다 놓으세요</p>
            <input id="file-upload-input" type="file" multiple className="hidden" onChange={e => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">선택된 파일 ({files.length})</p>
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30 text-sm">
                  <FileIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeFile(idx)}><X className="w-3 h-3" /></Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" size="sm" onClick={() => onClose(false)}>취소</Button>
          <Button size="sm" onClick={handleUpload} disabled={files.length === 0}><Upload className="w-4 h-4 mr-1" />업로드</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ====== Tree Row ====== */
function TreeRow({ item, level = 0, expandedIds, toggleExpand, checkedIds, onCheckChange }) {
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);
  const paddingLeft = 16 + level * 24;

  const leafIds = useMemo(() => {
    if (!hasChildren) return [item.statisticsId || item.id];
    const ids = [];
    const traverse = (n) => { if (n.children?.length) n.children.forEach(traverse); else ids.push(n.statisticsId || n.id); };
    item.children.forEach(traverse);
    return ids;
  }, [item, hasChildren]);

  const isChecked = leafIds.every(id => checkedIds.has(id));
  const isIndeterminate = !isChecked && leafIds.some(id => checkedIds.has(id));

  const handleCheck = (checked) => {
    onCheckChange(leafIds, !!checked);
  };

  const displayName = level === 0 ? item.accountName : (item.clusterName || item.accountName || '');

  return (
    <>
      <TableRow className={cn('cursor-pointer transition-colors hover:bg-muted/40', level === 0 && 'bg-muted/30 font-medium', isChecked && 'bg-primary/5')}>
        <TableCell style={{ paddingLeft }} className="py-2.5">
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0" onClick={e => { e.stopPropagation(); toggleExpand(item.id); }}>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </span>
            ) : <span className="w-4 h-4 flex-shrink-0" />}
            <Checkbox checked={isIndeterminate ? 'indeterminate' : isChecked} onCheckedChange={handleCheck} onClick={e => e.stopPropagation()} />
            <span className={cn(level === 0 ? 'font-semibold' : '')} onClick={() => hasChildren && toggleExpand(item.id)}>{displayName}</span>
            {level === 0 && hasChildren && <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">{item.children.length}</Badge>}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{(item.costCenterCount ?? 0).toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5">{(item.supplierCount ?? 0).toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums py-2.5 font-medium">{formatAmount(item.totalAmount)}</TableCell>
      </TableRow>
      {isExpanded && hasChildren && item.children.map(child => (
        <TreeRow key={child.id} item={child} level={level + 1} expandedIds={expandedIds} toggleExpand={toggleExpand} checkedIds={checkedIds} onCheckChange={onCheckChange} />
      ))}
    </>
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

/* ====== Main ====== */
export default function AbleTaskRegisterPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { isEditor } = useEditorLock(projectId);
  const { dashboardStatus } = useDashboardStatus(projectId);

  const [treeData, setTreeData] = useState([]);
  const [phaseStats, setPhaseStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [checkedIds, setCheckedIds] = useState(new Set());

  // Form state
  const [taskName, setTaskName] = useState('');
  const [department, setDepartment] = useState('');
  const [manager, setManager] = useState('');
  const [consultant, setConsultant] = useState('');
  const [baseAmount, setBaseAmount] = useState('');
  const [expectedSavingRate, setExpectedSavingRate] = useState('');
  const [expectedSavingAmount, setExpectedSavingAmount] = useState('');

  // Documents (local before task creation)
  const [pendingLinks, setPendingLinks] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);

  // Dialog states
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);

  // Load Short List selection tree (shortListItems 기반) + phase stats
  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      try {
        setLoading(true);
        const [treeRes, statsRes] = await Promise.all([
          costReductionService.getShortListSelectionTree(projectId),
          costReductionService.getShortListStats(projectId),
        ]);
        const tree = treeRes.tree || [];
        setTreeData(tree);
        setPhaseStats(statsRes);
        setExpandedIds(new Set(tree.map(n => n.id)));
      } catch (error) {
        console.error('Failed to load tree data:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const onCheckChange = useCallback((leafIds, checked) => {
    setCheckedIds(prev => {
      const n = new Set(prev);
      leafIds.forEach(id => checked ? n.add(id) : n.delete(id));
      return n;
    });
  }, []);

  // Derive major accounts and clusters from checked items
  const selectedInfo = useMemo(() => {
    const majorAccounts = new Set();
    const clusters = [];
    const traverse = (nodes) => {
      nodes.forEach(node => {
        if (node.children?.length) {
          traverse(node.children);
          const hasChecked = node.children.some(c => {
            if (c.children?.length) return c.children.some(sc => checkedIds.has(sc.statisticsId || sc.id));
            return checkedIds.has(c.statisticsId || c.id);
          });
          if (hasChecked && node.level === 1) majorAccounts.add(node.accountName);
        } else if (checkedIds.has(node.statisticsId || node.id)) {
          if (node.accountName) majorAccounts.add(node.accountName);
          clusters.push({
            statisticsId: node.statisticsId,
            clusterName: node.clusterName || node.accountName,
            accountName: node.accountName,
          });
        }
      });
    };
    traverse(treeData);
    return { majorAccounts: [...majorAccounts], clusters };
  }, [treeData, checkedIds]);

  const totals = useMemo(() => {
    let totalAmount = 0, supplierCount = 0, costCenterCount = 0;
    treeData.forEach(n => { totalAmount += n.totalAmount || 0; supplierCount += n.supplierCount || 0; costCenterCount += n.costCenterCount || 0; });
    return { totalAmount, supplierCount, costCenterCount };
  }, [treeData]);

  const handleAddLink = (linkData) => setPendingLinks(prev => [...prev, { id: Date.now(), ...linkData }]);
  const handleUploadFiles = (files) => setPendingFiles(prev => [...prev, ...files.map((f, i) => ({ id: Date.now() + i, file: f, name: f.name, label: f.name }))]);
  const handleDeletePendingDoc = (type, id) => {
    if (type === 'link') setPendingLinks(prev => prev.filter(d => d.id !== id));
    else setPendingFiles(prev => prev.filter(d => d.id !== id));
  };

  const handleCreateTask = async () => {
    if (!taskName.trim()) return;
    try {
      setSaving(true);
      const taskRes = await costReductionService.createTask(projectId, {
        taskName: taskName.trim(),
        majorAccounts: selectedInfo.majorAccounts,
        clusters: selectedInfo.clusters,
        department: department.trim(),
        manager: manager.trim(),
        consultant: consultant.trim(),
        baseAmount: baseAmount ? parseFloat(baseAmount) : null,
        expectedSavingRate: expectedSavingRate ? parseFloat(expectedSavingRate) : null,
        expectedSavingAmount: expectedSavingAmount ? parseFloat(expectedSavingAmount) : null,
      });

      const taskId = taskRes.id;
      for (const link of pendingLinks) {
        await costReductionService.addTaskLink(projectId, taskId, { url: link.url, label: link.label });
      }
      for (const item of pendingFiles) {
        try {
          const urlRes = await costReductionService.getTaskUploadUrl(projectId, taskId, item.name);
          await fetch(urlRes.presignedUrl, { method: 'PUT', body: item.file });
        } catch (err) {
          console.error('File upload failed:', item.name, err);
        }
      }

      setTaskName(''); setDepartment(''); setManager(''); setConsultant('');
      setBaseAmount(''); setExpectedSavingRate(''); setExpectedSavingAmount('');
      setCheckedIds(new Set()); setPendingLinks([]); setPendingFiles([]);
      alert('과제가 등록되었습니다.');
    } catch (error) {
      console.error('Failed to create task:', error);
      alert('과제 등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const allDocuments = [
    ...pendingLinks.map(l => ({ ...l, type: 'link' })),
    ...pendingFiles.map(f => ({ ...f, type: 'file' })),
  ];

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Able 과제 등록</h1>
              {!isEditor && <Badge variant="secondary">뷰어 모드</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-1">과제를 등록하고 관련 자료를 관리합니다</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${projectId}/shortlist`)}
            className="text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Short List로 이동
          </Button>
        </div>
        <PhaseNavigationBar stats={phaseStats} currentPhase="ABLE_REGISTER" projectId={projectId} navigate={navigate} />
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto p-6">
          <Card>
            <CardHeader className="pb-3 px-5 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">비용 유형 분류 (Short List 기반)</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => { const ids = new Set(); const t = (nodes) => { nodes.forEach(n => { ids.add(n.id); if (n.children?.length) t(n.children); }); }; t(treeData); setExpandedIds(ids); }}>모두 펼치기</Button>
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
                      <TableHead className="text-right w-[110px]">코스트센터 수</TableHead>
                      <TableHead className="text-right w-[110px]">공급업체 수</TableHead>
                      <TableHead className="text-right w-[130px]">합계 금액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {treeData.map(item => (
                      <TreeRow key={item.id} item={item} expandedIds={expandedIds} toggleExpand={toggleExpand} checkedIds={checkedIds} onCheckChange={onCheckChange} />
                    ))}
                    {treeData.length > 0 && (
                      <TableRow className="bg-primary/5 font-bold border-t-2">
                        <TableCell className="pl-4 py-3"><span className="text-sm font-bold">합계</span></TableCell>
                        <TableCell className="text-right tabular-nums py-3">{totals.costCenterCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums py-3">{totals.supplierCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums py-3 font-bold">{formatAmount(totals.totalAmount)}</TableCell>
                      </TableRow>
                    )}
                    {treeData.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">Short List에서 선택된 항목이 없습니다.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-[420px] border-l bg-card overflow-y-auto flex-shrink-0">
          <div className="p-5 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b">
              <FilePlus className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">내 과제 등록하기</h2>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">과제명</Label>
              <Input value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="과제명을 입력하세요" className="h-9 text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">관련 대계정명</Label>
              <div className="min-h-[36px] flex flex-wrap gap-1.5 p-2 rounded-md border bg-muted/20">
                {selectedInfo.majorAccounts.length > 0
                  ? selectedInfo.majorAccounts.map(name => <Badge key={name} variant="secondary" className="text-xs">{name}</Badge>)
                  : <span className="text-xs text-muted-foreground">좌측 트리에서 항목을 선택하세요</span>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">관련 클러스터명</Label>
              <div className="min-h-[36px] flex flex-wrap gap-1.5 p-2 rounded-md border bg-muted/20">
                {selectedInfo.clusters.length > 0
                  ? selectedInfo.clusters.map((c, i) => <Badge key={i} variant="secondary" className="text-xs">{c.clusterName}</Badge>)
                  : <span className="text-xs text-muted-foreground">좌측 트리에서 항목을 선택하세요</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">고객사 담당부서</Label>
                <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="담당부서" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">담당자명</Label>
                <Input value={manager} onChange={e => setManager(e.target.value)} placeholder="담당자명" className="h-9 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">담당 컨설턴트 명</Label>
              <Input value={consultant} onChange={e => setConsultant(e.target.value)} placeholder="컨설턴트 명" className="h-9 text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">모수 금액</Label>
              <Input value={baseAmount} onChange={e => setBaseAmount(e.target.value)} placeholder="0" className="h-9 text-sm text-right tabular-nums" type="number" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">예상 절감율 (%)</Label>
                <Input value={expectedSavingRate} onChange={e => setExpectedSavingRate(e.target.value)} placeholder="0.0" className="h-9 text-sm text-right tabular-nums" type="number" step="0.1" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">예상 절감액</Label>
                <Input value={expectedSavingAmount} onChange={e => setExpectedSavingAmount(e.target.value)} placeholder="0" className="h-9 text-sm text-right tabular-nums" type="number" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">자료 목록</Label>
                <span className="text-[10px] text-muted-foreground">총 {allDocuments.length}건</span>
              </div>
              <div className="border rounded-lg bg-muted/30">
                {allDocuments.length > 0 ? (
                  <div className="divide-y">
                    {allDocuments.map(doc => (
                      <div key={doc.id} className="flex items-center gap-2 px-3 py-2 group">
                        {doc.type === 'link' ? <Link2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /> : <FileIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{doc.label}</p>
                          {doc.type === 'link' && <p className="text-[10px] text-muted-foreground truncate">{doc.url}</p>}
                        </div>
                        <Badge variant="outline" className="text-[9px] flex-shrink-0 px-1 py-0">{doc.type === 'link' ? '링크' : '파일'}</Badge>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={() => handleDeletePendingDoc(doc.type, doc.id)}>
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
                <Button variant="outline" size="sm" className="text-xs h-7 flex-1" onClick={() => setLinkDialogOpen(true)}><Link2 className="w-3 h-3 mr-1" />링크 추가</Button>
                <Button variant="outline" size="sm" className="text-xs h-7 flex-1" onClick={() => setFileDialogOpen(true)}><Upload className="w-3 h-3 mr-1" />파일 업로드</Button>
              </div>
            </div>

            <Button className="w-full h-10" onClick={handleCreateTask} disabled={!isEditor || saving || !taskName.trim()}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FilePlus className="w-4 h-4 mr-2" />}
              과제 등록
            </Button>
          </div>
        </div>
      </div>

      <LinkAddDialog open={linkDialogOpen} onClose={setLinkDialogOpen} onAdd={handleAddLink} />
      <FileUploadDialog open={fileDialogOpen} onClose={setFileDialogOpen} onUpload={handleUploadFiles} />
    </div>
  );
}
