import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Search, Edit2, Eye, Trash2, FolderKanban,
  TrendingUp, DollarSign, ClipboardList, CheckCircle2, Clock,
  AlertCircle, FileText, Link2, FileIcon, ExternalLink, X, Save, Loader2,
  ArrowRight, ArrowUpDown, ArrowUp, ArrowDown, Plus, Pencil, Download,
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

const CHART_COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const STATUS_MAP = {
  '진행 중': { color: 'bg-blue-100 text-blue-700', icon: Clock },
  '검토 중': { color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
  '보류': { color: 'bg-gray-100 text-gray-700', icon: AlertCircle },
  '완료': { color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};
const STATUS_OPTIONS = ['진행 중', '검토 중', '보류', '완료'];
const STATUS_COLORS = {
  '진행 중': '#3b82f6',  // blue
  '검토 중': '#f59e0b',  // amber
  '보류': '#6b7280',     // gray
  '완료': '#10b981',     // green
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
    // level 2: 직접 level 2인 항목 + level 3 항목의 parentClusterName
    const names = new Set();
    arr.forEach(c => {
      if (c.level === 2 && c.clusterName) names.add(c.clusterName);
      if (c.level === 3 && c.parentClusterName) names.add(c.parentClusterName);
    });
    return [...names];
  }
  // level 3: 세부클러스터
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

/* ====== Task Detail Modal ====== */
function TaskDetailModal({ open, onClose, task, projectId }) {
  const [documents, setDocuments] = useState([]);
  const [weeklyProgress, setWeeklyProgress] = useState([]);
  useEffect(() => {
    if (task && open) {
      costReductionService.getTaskDocuments(projectId, task.id).then(setDocuments).catch(console.error);
      costReductionService.getWeeklyProgress(projectId, task.id).then(setWeeklyProgress).catch(console.error);
    }
  }, [task, open, projectId]);

  if (!task) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-blue-600" />{task.taskName} 상세 정보</DialogTitle>
          <DialogDescription>과제 등록 정보를 확인합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">과제명:</span> <span className="font-medium">{task.taskName}</span></div>
            <div><span className="text-muted-foreground">상태:</span> <Badge className={cn('text-xs ml-1', STATUS_MAP[task.status]?.color)}>{task.status}</Badge></div>
            <div><span className="text-muted-foreground">대계정:</span> <span className="font-medium">{task.majorAccounts?.join(', ') || '-'}</span></div>
            <div><span className="text-muted-foreground">클러스터명:</span> <span className="font-medium">{getClusterNames(task.clusters, 2).join(', ') || '-'}</span></div>
            <div><span className="text-muted-foreground">세부클러스터명:</span> <span className="font-medium">{getClusterNames(task.clusters, 3).join(', ') || '-'}</span></div>
            <div><span className="text-muted-foreground">담당부서:</span> <span className="font-medium">{task.department || '-'}</span></div>
            <div><span className="text-muted-foreground">담당자:</span> <span className="font-medium">{task.manager || '-'}</span></div>
            <div><span className="text-muted-foreground">컨설턴트:</span> <span className="font-medium">{task.consultant || '-'}</span></div>
          </div>
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">모수 금액</span><span className="font-semibold tabular-nums">{task.baseAmount ? task.baseAmount.toLocaleString() + '원' : '-'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">예상 절감율</span><span className="font-semibold tabular-nums">{task.expectedSavingRate ?? '-'}%</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">예상 절감액</span><span className="font-semibold tabular-nums text-green-600">{task.expectedSavingAmount ? task.expectedSavingAmount.toLocaleString() + '원' : '-'}</span></div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">진척율</span><span className="font-semibold tabular-nums">{task.progress ?? 0}%</span></div>
              <Progress value={task.progress ?? 0} className="h-2" />
            </div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">등록 자료</span><span className="font-semibold tabular-nums">{documents.length}건</span></div>
          </div>

          {/* 주차별 진척사항 요약 */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">주차별 진척사항</h4>
            {weeklyProgress.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">등록된 주차별 진척사항이 없습니다.</p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs w-[70px]">주차</TableHead>
                      <TableHead className="text-xs">진행사항</TableHead>
                      <TableHead className="text-xs">이슈사항</TableHead>
                      <TableHead className="text-xs w-[70px]">작성자</TableHead>
                      <TableHead className="text-xs w-[90px]">작성일</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeklyProgress.map(wp => (
                      <TableRow key={wp.id}>
                        <TableCell className="text-xs font-medium">{wp.weekNumber}</TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap max-w-[200px]">{wp.progressDetails || '-'}</TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap max-w-[200px]">{wp.issues || '-'}</TableCell>
                        <TableCell className="text-xs">{wp.author || '-'}</TableCell>
                        <TableCell className="text-xs tabular-nums">{wp.createdAt ? new Date(wp.createdAt).toLocaleDateString('ko-KR') : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onClose(false)}>닫기</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====== Weekly Progress Sub-Modal (상세보기/수정) ====== */
function WeeklyProgressSubModal({ open, onClose, item, mode, onSave }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (item) setForm({ weekNumber: item.weekNumber || '', progressDetails: item.progressDetails || '', issues: item.issues || '', author: item.author || '' });
  }, [item]);
  if (!item) return null;
  const isView = mode === 'view';
  const handleChange = (f, v) => setForm(prev => ({ ...prev, [f]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{isView ? <Eye className="w-5 h-5 text-blue-600" /> : <Pencil className="w-5 h-5 text-orange-600" />}{isView ? '진척사항 상세' : '진척사항 수정'}</DialogTitle>
          <DialogDescription>{isView ? '주차별 진척사항 상세 내용입니다.' : '진척사항을 수정합니다.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">주차</Label>{isView ? <p className="text-sm font-medium">{form.weekNumber}</p> : <Input value={form.weekNumber} onChange={e => handleChange('weekNumber', e.target.value)} className="h-8 text-sm" placeholder="예: 1주차" />}</div>
            <div className="space-y-1"><Label className="text-xs">작성자</Label>{isView ? <p className="text-sm font-medium">{form.author || '-'}</p> : <Input value={form.author} onChange={e => handleChange('author', e.target.value)} className="h-8 text-sm" />}</div>
          </div>
          <div className="space-y-1"><Label className="text-xs">진행사항</Label>{isView ? <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 min-h-[60px]">{form.progressDetails || '-'}</p> : <Textarea value={form.progressDetails} onChange={e => handleChange('progressDetails', e.target.value)} rows={3} className="text-sm" placeholder="진행사항을 입력하세요" />}</div>
          <div className="space-y-1"><Label className="text-xs">이슈사항</Label>{isView ? <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 min-h-[60px]">{form.issues || '-'}</p> : <Textarea value={form.issues} onChange={e => handleChange('issues', e.target.value)} rows={3} className="text-sm" placeholder="이슈사항을 입력하세요" />}</div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose(false)}>닫기</Button>
          {!isView && <Button size="sm" onClick={() => { onSave(item.id, form); onClose(false); }}><Save className="w-3.5 h-3.5 mr-1" />저장</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====== Task Edit Modal ====== */
function TaskEditModal({ open, onClose, task, onSave, projectId }) {
  const [form, setForm] = useState({});
  const [weeklyList, setWeeklyList] = useState([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [addForm, setAddForm] = useState(null); // null = hidden, object = form data
  const [subModal, setSubModal] = useState({ open: false, item: null, mode: 'view' });

  useEffect(() => {
    if (task) {
      setForm({
        taskName: task.taskName, department: task.department, manager: task.manager, consultant: task.consultant,
        baseAmount: task.baseAmount, expectedSavingRate: task.expectedSavingRate,
        expectedSavingAmount: task.expectedSavingAmount, progress: task.progress, status: task.status,
        actualSaving: task.actualSaving, rating: task.rating,
      });
      setAddForm(null);
    }
  }, [task]);

  // Load weekly progress
  useEffect(() => {
    if (task && open && projectId) {
      setWeeklyLoading(true);
      costReductionService.getWeeklyProgress(projectId, task.id).then(setWeeklyList).catch(console.error).finally(() => setWeeklyLoading(false));
    }
  }, [task, open, projectId]);

  // 절감율 변경 시 절감액 자동 계산
  useEffect(() => {
    const base = parseFloat(form.baseAmount) || 0;
    const rate = parseFloat(form.expectedSavingRate) || 0;
    if (base > 0 && rate > 0) {
      const calculated = Math.round(base * rate / 100);
      setForm(prev => {
        if (prev.expectedSavingAmount !== calculated) return { ...prev, expectedSavingAmount: calculated };
        return prev;
      });
    }
  }, [form.baseAmount, form.expectedSavingRate]);

  if (!task) return null;
  const handleChange = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const handleAddWeekly = async () => {
    if (!addForm?.weekNumber) return;
    try {
      const created = await costReductionService.createWeeklyProgress(projectId, task.id, addForm);
      setWeeklyList(prev => [created, ...prev]);
      setAddForm(null);
    } catch (e) { console.error('Failed to create weekly progress:', e); }
  };

  const handleUpdateWeekly = async (progressId, data) => {
    try {
      const updated = await costReductionService.updateWeeklyProgress(projectId, task.id, progressId, data);
      setWeeklyList(prev => prev.map(w => w.id === progressId ? updated : w));
    } catch (e) { console.error('Failed to update weekly progress:', e); }
  };

  const handleDeleteWeekly = async (progressId) => {
    try {
      await costReductionService.deleteWeeklyProgress(projectId, task.id, progressId);
      setWeeklyList(prev => prev.filter(w => w.id !== progressId));
    } catch (e) { console.error('Failed to delete weekly progress:', e); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit2 className="w-5 h-5 text-orange-600" />과제 수정</DialogTitle>
            <DialogDescription>과제 정보를 수정하고 주차별 진척사항을 관리합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* 과제 기본 정보 */}
            <div className="space-y-1.5"><Label>과제명</Label><Input value={form.taskName || ''} onChange={e => handleChange('taskName', e.target.value)} className="h-9 text-sm" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>담당부서</Label><Input value={form.department || ''} onChange={e => handleChange('department', e.target.value)} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label>담당자명</Label><Input value={form.manager || ''} onChange={e => handleChange('manager', e.target.value)} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label>컨설턴트</Label><Input value={form.consultant || ''} onChange={e => handleChange('consultant', e.target.value)} className="h-9 text-sm" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>모수금액</Label><Input type="number" step={1} value={form.baseAmount ?? ''} onChange={e => handleChange('baseAmount', e.target.value === '' ? '' : +e.target.value)} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label>절감율 (%)</Label><Input type="number" step="0.1" value={form.expectedSavingRate ?? ''} onChange={e => handleChange('expectedSavingRate', e.target.value === '' ? '' : +e.target.value)} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label>절감액 (자동계산)</Label><Input type="number" step={1} value={form.expectedSavingAmount ?? ''} readOnly className="h-9 text-sm bg-muted/50" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>진척율 (%)</Label>
                <Input type="text" inputMode="numeric"
                  value={form.progress != null && form.progress !== '' ? String(Number(form.progress)) : ''}
                  onChange={e => { const raw = e.target.value.replace(/[^\d]/g, ''); if (raw === '') handleChange('progress', ''); else handleChange('progress', Math.min(100, Math.max(0, parseInt(raw, 10)))); }}
                  className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5"><Label>상태</Label>
                <Select value={form.status || ''} onValueChange={v => handleChange('status', v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {form.status === '완료' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>실제 절감액</Label><Input type="number" step={1} value={form.actualSaving ?? ''} onChange={e => handleChange('actualSaving', e.target.value === '' ? '' : +e.target.value)} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label>등급</Label>
                  <Select value={form.rating || ''} onValueChange={v => handleChange('rating', v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="등급" /></SelectTrigger>
                    <SelectContent><SelectItem value="A+">A+</SelectItem><SelectItem value="A">A</SelectItem><SelectItem value="B+">B+</SelectItem><SelectItem value="B">B</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* 주차별 진척사항 게시판 */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">주차별 진척사항</h4>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAddForm({ weekNumber: '', progressDetails: '', issues: '', author: '' })}>
                  <Plus className="w-3.5 h-3.5" />추가
                </Button>
              </div>

              {/* 인라인 추가 폼 */}
              {addForm && (
                <div className="border rounded-md p-3 mb-3 bg-blue-50/50 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="주차 (예: 1주차)" value={addForm.weekNumber} onChange={e => setAddForm(prev => ({ ...prev, weekNumber: e.target.value }))} className="h-8 text-sm" />
                    <Input placeholder="작성자" value={addForm.author} onChange={e => setAddForm(prev => ({ ...prev, author: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <Textarea placeholder="진행사항" value={addForm.progressDetails} onChange={e => setAddForm(prev => ({ ...prev, progressDetails: e.target.value }))} rows={2} className="text-sm" />
                  <Textarea placeholder="이슈사항" value={addForm.issues} onChange={e => setAddForm(prev => ({ ...prev, issues: e.target.value }))} rows={2} className="text-sm" />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddForm(null)}>취소</Button>
                    <Button size="sm" className="h-7 text-xs" onClick={handleAddWeekly} disabled={!addForm.weekNumber}><Save className="w-3 h-3 mr-1" />등록</Button>
                  </div>
                </div>
              )}

              {weeklyLoading ? (
                <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
              ) : weeklyList.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 border rounded-md">등록된 주차별 진척사항이 없습니다.</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs w-[70px]">주차</TableHead>
                        <TableHead className="text-xs">진행사항</TableHead>
                        <TableHead className="text-xs">이슈사항</TableHead>
                        <TableHead className="text-xs w-[70px]">작성자</TableHead>
                        <TableHead className="text-xs w-[90px]">작성일</TableHead>
                        <TableHead className="text-xs w-[80px] text-center">관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weeklyList.map(wp => (
                        <TableRow key={wp.id} className="hover:bg-muted/30">
                          <TableCell className="text-xs font-medium">{wp.weekNumber}</TableCell>
                          <TableCell className="text-xs truncate max-w-[180px]" title={wp.progressDetails}>{wp.progressDetails || '-'}</TableCell>
                          <TableCell className="text-xs truncate max-w-[180px]" title={wp.issues}>{wp.issues || '-'}</TableCell>
                          <TableCell className="text-xs">{wp.author || '-'}</TableCell>
                          <TableCell className="text-xs tabular-nums">{wp.createdAt ? new Date(wp.createdAt).toLocaleDateString('ko-KR') : '-'}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setSubModal({ open: true, item: wp, mode: 'view' })} title="상세보기"><Eye className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setSubModal({ open: true, item: wp, mode: 'edit' })} title="수정"><Pencil className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-500 hover:text-red-700" onClick={() => handleDeleteWeekly(wp.id)} title="삭제"><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onClose(false)}><X className="w-4 h-4 mr-1.5" />취소</Button>
            <Button onClick={() => { onSave(task.id, form); onClose(false); }}><Save className="w-4 h-4 mr-1.5" />저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 주차별 진척사항 상세/수정 서브 모달 */}
      <WeeklyProgressSubModal
        open={subModal.open}
        onClose={() => setSubModal({ open: false, item: null, mode: 'view' })}
        item={subModal.item}
        mode={subModal.mode}
        onSave={handleUpdateWeekly}
      />
    </>
  );
}

/* ====== Documents Modal ====== */
function TaskDocumentsModal({ open, onClose, task, projectId, isEditor }) {
  const [documents, setDocuments] = useState([]);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);

  const loadDocs = () => {
    if (task) costReductionService.getTaskDocuments(projectId, task.id).then(setDocuments).catch(console.error);
  };

  useEffect(() => {
    if (task && open) loadDocs();
  }, [task, open, projectId]);

  const handleAddLink = async () => {
    if (!newLinkUrl.trim()) return;
    try {
      await costReductionService.addTaskLink(projectId, task.id, { url: newLinkUrl.trim(), label: newLinkLabel.trim() || newLinkUrl.trim() });
      setNewLinkUrl(''); setNewLinkLabel(''); setAddLinkOpen(false);
      loadDocs();
    } catch (e) { alert('링크 추가 실패: ' + (e.response?.data?.message || e.message)); }
  };

  const handleUploadFiles = async (files) => {
    setUploading(true);
    try {
      for (const file of files) {
        const urlRes = await costReductionService.getTaskUploadUrl(projectId, task.id, file.name);
        await fetch(urlRes.presignedUrl, { method: 'PUT', body: file });
      }
      loadDocs();
    } catch (e) { alert('파일 업로드 실패: ' + (e.response?.data?.message || e.message)); }
    finally { setUploading(false); }
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('이 자료를 삭제하시겠습니까?')) return;
    try {
      await costReductionService.deleteTaskDocument(projectId, task.id, docId);
      loadDocs();
    } catch (e) { alert('삭제 실패: ' + (e.response?.data?.message || e.message)); }
  };

  if (!task) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[900px] max-w-[900px] h-[80vh] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" />자료 관리 - {task.taskName}</DialogTitle>
          <DialogDescription>등록된 자료를 조회하고 추가/삭제할 수 있습니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {documents.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">등록된 자료가 없습니다.</div>}
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/60">
              <div className={cn('w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0', doc.type === 'link' ? 'bg-blue-100' : 'bg-green-100')}>
                {doc.type === 'link' ? <Link2 className="w-4 h-4 text-blue-600" /> : <FileIcon className="w-4 h-4 text-green-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" title={doc.label}>{doc.label}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[500px]" title={doc.url || doc.name}>{doc.url || doc.name}</p>
              </div>
              <Badge variant="outline" className={cn('text-[10px] flex-shrink-0', doc.type === 'link' ? 'border-blue-300 text-blue-600' : 'border-green-300 text-green-600')}>{doc.type === 'link' ? '링크' : '파일'}</Badge>
              {doc.url && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0" onClick={() => window.open(doc.url, '_blank')} title="링크 열기"><ExternalLink className="w-3.5 h-3.5 text-muted-foreground" /></Button>}
              {doc.url && doc.type === 'file' && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0" onClick={() => { const a = document.createElement('a'); a.href = doc.url; a.download = doc.name || ''; document.body.appendChild(a); a.click(); document.body.removeChild(a); }} title="파일 다운로드"><Download className="w-3.5 h-3.5 text-green-600" /></Button>}
              {isEditor && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0 text-red-500 hover:text-red-700" onClick={() => handleDeleteDoc(doc.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
            </div>
          ))}
        </div>

        {/* 링크 추가 인라인 */}
        {addLinkOpen && (
          <div className="border rounded-lg p-3 space-y-2 bg-blue-50/50">
            <Label className="text-xs">URL</Label>
            <Input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
            <Label className="text-xs">라벨 (선택)</Label>
            <Input value={newLinkLabel} onChange={e => setNewLinkLabel(e.target.value)} placeholder="링크 설명" className="h-8 text-sm" />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setAddLinkOpen(false); setNewLinkUrl(''); setNewLinkLabel(''); }}>취소</Button>
              <Button size="sm" onClick={handleAddLink} disabled={!newLinkUrl.trim()}>추가</Button>
            </div>
          </div>
        )}

        <input type="file" ref={fileInputRef} multiple className="hidden" onChange={e => { if (e.target.files?.length) handleUploadFiles([...e.target.files]); e.target.value = ''; }} />

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-muted-foreground">총 {documents.length}건의 자료</span>
            <div className="flex gap-2">
              {isEditor && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setAddLinkOpen(true)} disabled={addLinkOpen}>
                    <Link2 className="w-3 h-3 mr-1" />링크 추가
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}파일 업로드
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={() => onClose(false)}>닫기</Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====== Phase Navigation Bar ====== */
function PhaseNavigationBar({ stats, summary, currentPhase, projectId, navigate }) {
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
  ];
  const TOTAL_SLOTS = 5;
  const currentIdx = phases.findIndex(p => p.key === currentPhase);
  const emptySlots = TOTAL_SLOTS - phases.length;
  return (
    <div className="flex items-center gap-1.5 py-3 font-pretendard w-full">
      {phases.map((phase, idx) => {
        const isActive = phase.key === currentPhase;
        const isPast = idx < currentIdx;
        return (
          <React.Fragment key={phase.key}>
            {idx > 0 && <ArrowRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />}
            <button
              onClick={() => navigate(phase.path)}
              className={cn(
                'flex-1 basis-0 flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-lg font-pretendard transition-colors min-w-0',
                isActive && 'bg-blue-600 text-white',
                isPast && 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                !isActive && !isPast && 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              <div className="flex items-center gap-1.5">
                {isPast && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
                <span className="font-bold text-xl whitespace-nowrap">{phase.label}</span>
              </div>
              {phase.line1 != null && (
                <div className={cn('text-[19px] leading-snug text-center font-medium', isActive ? 'text-white/90' : 'text-black')}>
                  <div>{phase.line1}</div>
                  <div>{phase.line2}</div>
                </div>
              )}
            </button>
          </React.Fragment>
        );
      })}
      {emptySlots > 0 && Array.from({ length: emptySlots }).map((_, i) => (
        <div key={`empty-${i}`} className="flex-1 basis-0 min-w-0" />
      ))}
    </div>
  );
}

/* ====== Main ====== */
export default function AbleTaskManagePage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { isEditor } = useEditorLock(projectId);
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [phaseStats, setPhaseStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [detailTask, setDetailTask] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [docsTask, setDocsTask] = useState(null);
  const [deleteTask, setDeleteTask] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksRes, summaryRes, statsRes] = await Promise.all([
        costReductionService.getTasks(projectId),
        costReductionService.getTaskSummary(projectId),
        costReductionService.getShortListStats(projectId).catch(() => null),
      ]);
      setTasks(tasksRes);
      setSummary(summaryRes);
      setPhaseStats(statsRes);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (projectId) loadData(); }, [projectId]);

  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (searchKeyword && !t.taskName?.includes(searchKeyword) && !t.department?.includes(searchKeyword) && !t.manager?.includes(searchKeyword)) return false;
    return true;
  }), [tasks, statusFilter, searchKeyword]);

  const handleEditSave = async (taskId, form) => {
    try { await costReductionService.updateTask(projectId, taskId, form); loadData(); } catch (error) { console.error('Failed to update task:', error); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTask) return;
    try {
      setDeleting(true);
      await costReductionService.deleteTask(projectId, deleteTask.id);
      setDeleteTask(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete task:', error);
    } finally {
      setDeleting(false);
    }
  };

  const statusChartData = useMemo(() => {
    const map = {}; STATUS_OPTIONS.forEach(s => { map[s] = 0; }); tasks.forEach(t => { if (map[t.status] !== undefined) map[t.status]++; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [tasks]);

  const consultantTaskCountData = useMemo(() => {
    const map = {};
    tasks.forEach(t => { const c = t.consultant || '미배정'; if (!map[c]) map[c] = { name: c, 과제수: 0 }; map[c].과제수++; });
    return Object.values(map);
  }, [tasks]);

  const consultantSavingData = useMemo(() => {
    const map = {};
    tasks.forEach(t => { const c = t.consultant || '미배정'; if (!map[c]) map[c] = { name: c, 절감액: 0 }; map[c].절감액 += (t.expectedSavingAmount || 0); });
    return Object.values(map);
  }, [tasks]);

  const abbreviateYAxis = (v) => {
    if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
    if (v >= 10000) return (v / 10000).toFixed(0) + '만';
    return v;
  };

  // Sort state
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return { key: null, direction: null };
      }
      return { key, direction: 'asc' };
    });
  };
  const SortIcon = ({ colKey }) => {
    if (sortConfig.key !== colKey) return <ArrowUpDown className="w-3 h-3 ml-1 inline opacity-40" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 inline" /> : <ArrowDown className="w-3 h-3 ml-1 inline" />;
  };

  const sortedTasks = useMemo(() => {
    let result = [...filteredTasks];
    if (sortConfig.key && sortConfig.direction) {
      result.sort((a, b) => {
        let aVal, bVal;
        switch (sortConfig.key) {
          case 'taskName': aVal = a.taskName || ''; bVal = b.taskName || ''; break;
          case 'baseAmount': aVal = a.baseAmount || 0; bVal = b.baseAmount || 0; break;
          case 'savingAmount': aVal = a.expectedSavingAmount || 0; bVal = b.expectedSavingAmount || 0; break;
          case 'progress': aVal = a.progress || 0; bVal = b.progress || 0; break;
          case 'status': aVal = a.status || ''; bVal = b.status || ''; break;
          default: return 0;
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort by createdAt ascending
      result.sort((a, b) => {
        const aDate = a.createdAt || '';
        const bDate = b.createdAt || '';
        return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
      });
    }
    return result;
  }, [filteredTasks, sortConfig]);

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-bold text-foreground">Able 과제 관리</h1><p className="text-sm text-muted-foreground mt-1">등록된 과제의 현황을 관리하고 모니터링합니다</p></div>
        </div>
        <PhaseNavigationBar stats={phaseStats} summary={summary} currentPhase="ABLE_MANAGE" projectId={projectId} navigate={navigate} />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0"><ClipboardList className="w-5 h-5 text-white" /></div><div><p className="text-xs font-bold text-muted-foreground">총 과제 수</p><p className="text-xl font-bold tabular-nums">{summary?.totalTasks ?? 0}<span className="text-sm font-normal ml-0.5">건</span></p></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0"><DollarSign className="w-5 h-5 text-white" /></div><div><p className="text-xs font-bold text-muted-foreground">총 모수 금액</p><p className="text-xl font-bold tabular-nums">{formatAmount(summary?.totalBaseAmount ?? 0)}</p></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0"><TrendingUp className="w-5 h-5 text-white" /></div><div><p className="text-xs font-bold text-muted-foreground">총 예상 절감액</p><p className="text-xl font-bold tabular-nums text-green-600">{formatAmount(summary?.totalSavingAmount ?? 0)}</p></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0"><FolderKanban className="w-5 h-5 text-white" /></div><div><p className="text-xs font-bold text-muted-foreground">평균 진척율</p><p className="text-xl font-bold tabular-nums">{summary?.avgProgress ?? 0}<span className="text-sm font-normal ml-0.5">%</span></p></div></div></CardContent></Card>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2 px-5 pt-4"><CardTitle className="text-sm font-semibold">과제 상태별 현황</CardTitle></CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart><Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} label={({ name, value }) => `${name} ${value}`}>{statusChartData.map((entry, idx) => <Cell key={idx} fill={STATUS_COLORS[entry.name] || CHART_COLORS[idx]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 px-5 pt-4"><CardTitle className="text-sm font-semibold">컨설턴트별 과제수</CardTitle></CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={consultantTaskCountData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Bar dataKey="과제수" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 px-5 pt-4"><CardTitle className="text-sm font-semibold">컨설턴트별 절감액</CardTitle></CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={consultantSavingData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={abbreviateYAxis} /><Tooltip formatter={(v) => v.toLocaleString() + '원'} /><Bar dataKey="절감액" fill="#10b981" radius={[4, 4, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3 px-5 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">과제 목록</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative"><Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="과제명, 부서, 담당자 검색..." value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} className="pl-8 h-8 w-[200px] text-xs" /></div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[50px] text-center">No</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort('taskName')}>과제명<SortIcon colKey="taskName" /></TableHead>
                      <TableHead>대계정</TableHead><TableHead className="max-w-[120px]">클러스터명</TableHead><TableHead className="max-w-[120px]">세부클러스터명</TableHead><TableHead>담당부서</TableHead><TableHead>담당자명</TableHead><TableHead>컨설턴트</TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('baseAmount')}>모수 금액<SortIcon colKey="baseAmount" /></TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('savingAmount')}>절감액<SortIcon colKey="savingAmount" /></TableHead>
                      <TableHead className="w-[120px] cursor-pointer select-none" onClick={() => handleSort('progress')}>진척율<SortIcon colKey="progress" /></TableHead>
                      <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort('status')}>상태<SortIcon colKey="status" /></TableHead>
                      <TableHead className="text-center">등록시간</TableHead><TableHead className="text-center">수정시간</TableHead>
                      <TableHead className="text-center w-[130px]">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTasks.map((task, idx) => (
                      <TableRow key={task.id} className="hover:bg-muted/30">
                        <TableCell className="text-center text-xs tabular-nums">{idx + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{task.taskName}</TableCell>
                        <TableCell className="text-xs">{task.majorAccounts?.join(', ') || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[120px]"><ClusterNames clusters={task.clusters} level={2} /></TableCell>
                        <TableCell className="text-xs max-w-[120px]"><ClusterNames clusters={task.clusters} level={3} /></TableCell>
                        <TableCell className="text-xs">{task.department || '-'}</TableCell>
                        <TableCell className="text-xs">{task.manager || '-'}</TableCell>
                        <TableCell className="text-xs">{task.consultant || '-'}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatAmount(task.baseAmount ?? 0)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-green-600 font-medium">{formatAmount(task.expectedSavingAmount ?? 0)}</TableCell>
                        <TableCell><div className="flex items-center gap-2"><Progress value={task.progress ?? 0} className="h-1.5 flex-1" /><span className="text-[10px] tabular-nums w-8 text-right">{task.progress ?? 0}%</span></div></TableCell>
                        <TableCell className="text-center"><Badge className={cn('text-[10px] px-1.5', STATUS_MAP[task.status]?.color)}>{task.status}</Badge></TableCell>
                        <TableCell className="text-center text-[10px] tabular-nums text-muted-foreground">{task.createdAt ? new Date(task.createdAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</TableCell>
                        <TableCell className="text-center text-[10px] tabular-nums text-muted-foreground">{task.updatedAt ? new Date(task.updatedAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDetailTask(task)} title="상세 보기"><Eye className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditTask(task)} title="수정" disabled={!isEditor}><Edit2 className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDocsTask(task)} title="자료 조회"><FileText className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTask(task)} title="삭제" disabled={!isEditor}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {sortedTasks.length === 0 && <TableRow><TableCell colSpan={15} className="text-center text-sm text-muted-foreground py-8">{tasks.length === 0 ? '등록된 과제가 없습니다.' : '검색 결과가 없습니다.'}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="px-5 py-3 border-t text-xs text-muted-foreground">총 {sortedTasks.length}건 표시 중</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <TaskDetailModal open={!!detailTask} onClose={() => setDetailTask(null)} task={detailTask} projectId={projectId} />
      <TaskEditModal open={!!editTask} onClose={() => setEditTask(null)} task={editTask} onSave={handleEditSave} projectId={projectId} />
      <TaskDocumentsModal open={!!docsTask} onClose={() => setDocsTask(null)} task={docsTask} projectId={projectId} isEditor={isEditor} />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTask} onOpenChange={() => setDeleteTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600" />과제 삭제</DialogTitle>
            <DialogDescription>이 작업은 되돌릴 수 없습니다.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-foreground"><span className="font-semibold">{deleteTask?.taskName}</span> 과제를 완전히 삭제하시겠습니까?</p>
            <p className="text-xs text-muted-foreground mt-2">과제와 관련된 모든 데이터(첨부 자료 포함)가 영구적으로 삭제됩니다.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTask(null)} disabled={deleting}>취소</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />삭제 중...</> : <><Trash2 className="w-4 h-4 mr-1.5" />삭제</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
