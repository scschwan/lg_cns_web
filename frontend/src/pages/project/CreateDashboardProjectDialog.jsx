import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, Loader2, BarChart3, AlertCircle,
  ArrowLeft, ArrowRight, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import projectService from '@/services/projectService';
import costReductionService from '@/services/costReductionService';

const NONE_VALUE = '__none__';

export default function CreateDashboardProjectDialog({ open, onClose, onSuccess }) {
  // Step 관리
  const [step, setStep] = useState(1); // 1: 프로젝트 정보, 2: 엑셀 Import

  // Step 1: 프로젝트 정보
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');

  // Step 2: 엑셀 Import
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const fileInputRef = useRef(null);
  const [accountName, setAccountName] = useState('');
  const [clusterColumn, setClusterColumn] = useState('');
  const [subClusterColumn, setSubClusterColumn] = useState('');
  const [supplierColumn, setSupplierColumn] = useState('');
  const [costCenterColumn, setCostCenterColumn] = useState('');
  const [amountColumn, setAmountColumn] = useState('');

  // 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const resetAll = () => {
    setStep(1);
    setProjectName('');
    setDescription('');
    setFile(null);
    setHeaders([]);
    setRowCount(0);
    setAccountName('');
    setClusterColumn('');
    setSubClusterColumn('');
    setSupplierColumn('');
    setCostCenterColumn('');
    setAmountColumn('');
    setLoading(false);
    setError('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (openState) => {
    if (!openState && !loading) {
      resetAll();
      onClose();
    }
  };

  // Step 1 → Step 2
  const handleNext = () => {
    if (!projectName.trim()) {
      setError('프로젝트 이름을 입력해주세요.');
      return;
    }
    setError('');
    setStep(2);
  };

  // 엑셀 파일 선택
  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.name.endsWith('.xlsx') && !selected.name.endsWith('.xls')) {
      setError('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.');
      return;
    }
    setError('');
    setResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        const cols = (jsonData[0] || []).filter(c => c != null && c !== '');
        const rows = jsonData.length - 1;
        setFile(selected);
        setHeaders(cols.map(String));
        setRowCount(rows > 0 ? rows : 0);
        autoMapColumns(cols.map(String));
      } catch (err) {
        setError('엑셀 파일을 읽을 수 없습니다: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(selected);
  };

  const autoMapColumns = (cols) => {
    for (const col of cols) {
      const lower = col.toLowerCase();
      if (lower.includes('클러스터') && !lower.includes('세부')) setClusterColumn(col);
      if (lower.includes('세부클러스터') || lower.includes('세부 클러스터')) setSubClusterColumn(col);
      if (lower.includes('공급업체') || lower.includes('supplier')) setSupplierColumn(col);
      if (lower.includes('코스트센터') || lower.includes('cost center') || lower.includes('부서')) setCostCenterColumn(col);
      if (lower.includes('금액') || lower.includes('amount') || lower.includes('money')) setAmountColumn(col);
    }
  };

  const canSubmit = file && accountName.trim() && clusterColumn && amountColumn && !loading;

  // 최종 제출: 프로젝트 생성 → 엑셀 Import
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');

    try {
      // 1. 대시보드 프로젝트 생성
      const project = await projectService.createProject({
        name: projectName.trim(),
        description: description.trim(),
        projectType: 'DASHBOARD',
      });

      const projectId = project.projectId;

      // 2. 클러스터링 엑셀 Import
      const importResult = await costReductionService.importClusteringExcel(projectId, {
        file,
        accountName: accountName.trim(),
        clusterColumn,
        subClusterColumn: subClusterColumn === NONE_VALUE ? '' : subClusterColumn,
        supplierColumn: supplierColumn === NONE_VALUE ? '' : supplierColumn,
        costCenterColumn: costCenterColumn === NONE_VALUE ? '' : costCenterColumn,
        amountColumn,
      });

      setResult({ ...importResult, projectId });

      if (onSuccess) await onSuccess(projectId);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || '프로젝트 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            대시보드 프로젝트 생성
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? '프로젝트 정보를 입력하세요.'
              : '클러스터링이 완료된 엑셀 파일을 업로드하여 대시보드를 바로 생성합니다.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 pb-2">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step >= 1 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-muted'}`}>1</div>
            프로젝트 정보
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step >= 2 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= 2 ? 'bg-emerald-100 text-emerald-700' : 'bg-muted'}`}>2</div>
            엑셀 Import
          </div>
        </div>

        <div className="space-y-4">
          {/* Step 1: 프로젝트 정보 */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>프로젝트 이름 <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="예: 2025년 1분기 비용 절감 대시보드"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">{projectName.length}/100자</p>
              </div>
              <div className="space-y-2">
                <Label>프로젝트 설명 <Badge variant="outline" className="ml-1 text-[10px]">선택</Badge></Label>
                <Textarea
                  placeholder="프로젝트에 대한 간단한 설명..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-xs text-emerald-700 font-medium">대시보드 프로젝트란?</p>
                <p className="text-xs text-emerald-600 mt-1">
                  이미 클러스터링이 완료된 엑셀 데이터를 업로드하여 7단계 분석 파이프라인 없이
                  바로 비용 절감 대시보드(Long List / Short List / Able 과제)를 사용할 수 있습니다.
                </p>
              </div>
            </>
          )}

          {/* Step 2: 엑셀 Import */}
          {step === 2 && !result && (
            <>
              {/* 파일 선택 */}
              <div className="space-y-2">
                <Label>엑셀 파일 <span className="text-red-500">*</span></Label>
                {!file ? (
                  <div
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">클릭하여 엑셀 파일을 선택하세요</p>
                    <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls 파일</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSpreadsheet className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{headers.length}개 컬럼, {rowCount.toLocaleString()}개 행</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setFile(null); setHeaders([]); setRowCount(0); if (fileInputRef.current) fileInputRef.current.value = ''; }}>변경</Button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} hidden />
              </div>

              {headers.length > 0 && (
                <>
                  <div className="space-y-1.5">
                    <Label>계정명 <span className="text-red-500">*</span></Label>
                    <Input placeholder="예: 여비교통비" value={accountName} onChange={e => setAccountName(e.target.value)} />
                    <p className="text-xs text-muted-foreground">대시보드 트리의 최상위 분류명</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>클러스터명 컬럼 <span className="text-red-500">*</span></Label>
                    <Select value={clusterColumn} onValueChange={setClusterColumn}>
                      <SelectTrigger><SelectValue placeholder="컬럼 선택..." /></SelectTrigger>
                      <SelectContent>{headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>세부클러스터명 컬럼 <Badge variant="outline" className="ml-1 text-[10px]">선택</Badge></Label>
                    <Select value={subClusterColumn || NONE_VALUE} onValueChange={v => setSubClusterColumn(v === NONE_VALUE ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>(없음)</SelectItem>
                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>금액 컬럼 <span className="text-red-500">*</span></Label>
                    <Select value={amountColumn} onValueChange={setAmountColumn}>
                      <SelectTrigger><SelectValue placeholder="컬럼 선택..." /></SelectTrigger>
                      <SelectContent>{headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>공급업체 컬럼 <Badge variant="outline" className="ml-1 text-[10px]">선택</Badge></Label>
                    <Select value={supplierColumn || NONE_VALUE} onValueChange={v => setSupplierColumn(v === NONE_VALUE ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>(없음)</SelectItem>
                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>코스트센터 컬럼 <Badge variant="outline" className="ml-1 text-[10px]">선택</Badge></Label>
                    <Select value={costCenterColumn || NONE_VALUE} onValueChange={v => setCostCenterColumn(v === NONE_VALUE ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>(없음)</SelectItem>
                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </>
          )}

          {/* 성공 결과 */}
          {result && (
            <div className="flex items-start gap-3 text-sm text-green-700 bg-green-50 rounded-lg p-4">
              <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">대시보드 프로젝트 생성 완료</p>
                <p className="text-xs mt-1.5">
                  {result.totalRows?.toLocaleString()}행, {result.clusterCount}개 클러스터가 등록되었습니다.
                </p>
                <p className="text-xs mt-1 text-green-600">
                  프로젝트 목록에서 "비용 절감 수행" 버튼으로 대시보드에 접근하세요.
                </p>
              </div>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-between pt-2 border-t">
          <div>
            {step === 2 && !result && !loading && (
              <Button variant="ghost" onClick={() => setStep(1)} className="gap-1">
                <ArrowLeft className="w-4 h-4" />이전
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
              {result ? '닫기' : '취소'}
            </Button>
            {step === 1 && (
              <Button onClick={handleNext} className="gap-1">
                다음<ArrowRight className="w-4 h-4" />
              </Button>
            )}
            {step === 2 && !result && (
              <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />생성 중...</>
                ) : (
                  <><BarChart3 className="w-4 h-4" />프로젝트 생성 및 Import</>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
