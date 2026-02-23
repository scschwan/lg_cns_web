import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import costReductionService from '../../services/costReductionService';

const NONE_VALUE = '__none__';

export default function ClusteringImportDialog({ open, onClose, projectId, onImportComplete }) {
  // 파일 상태
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const fileInputRef = useRef(null);

  // 컬럼 매핑
  const [accountName, setAccountName] = useState('');
  const [clusterColumn, setClusterColumn] = useState('');
  const [subClusterColumn, setSubClusterColumn] = useState('');
  const [supplierColumn, setSupplierColumn] = useState('');
  const [costCenterColumn, setCostCenterColumn] = useState('');
  const [amountColumn, setAmountColumn] = useState('');

  // 처리 상태
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const resetState = () => {
    setFile(null);
    setHeaders([]);
    setRowCount(0);
    setAccountName('');
    setClusterColumn('');
    setSubClusterColumn('');
    setSupplierColumn('');
    setCostCenterColumn('');
    setAmountColumn('');
    setUploading(false);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (openState) => {
    if (!openState) {
      resetState();
      onClose();
    }
  };

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.endsWith('.xlsx') && !selected.name.endsWith('.xls')) {
      setError('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.');
      return;
    }

    setError(null);
    setResult(null);

    // XLSX로 헤더 추출
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

        // 자동 매핑 시도
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
      if (lower.includes('클러스터') && !lower.includes('세부')) {
        setClusterColumn(col);
      }
      if (lower.includes('세부클러스터') || lower.includes('세부 클러스터')) {
        setSubClusterColumn(col);
      }
      if (lower.includes('공급업체') || lower.includes('supplier')) {
        setSupplierColumn(col);
      }
      if (lower.includes('코스트센터') || lower.includes('cost center') || lower.includes('부서')) {
        setCostCenterColumn(col);
      }
      if (lower.includes('금액') || lower.includes('amount') || lower.includes('money')) {
        setAmountColumn(col);
      }
    }
  };

  const canSubmit = file && accountName.trim() && clusterColumn && amountColumn && !uploading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const res = await costReductionService.importClusteringExcel(projectId, {
        file,
        accountName: accountName.trim(),
        clusterColumn,
        subClusterColumn: subClusterColumn === NONE_VALUE ? '' : subClusterColumn,
        supplierColumn: supplierColumn === NONE_VALUE ? '' : supplierColumn,
        costCenterColumn: costCenterColumn === NONE_VALUE ? '' : costCenterColumn,
        amountColumn,
      });

      setResult(res);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Import 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            클러스터링 엑셀 Import
          </DialogTitle>
          <DialogDescription>
            이미 클러스터링이 완료된 엑셀 파일을 업로드하여 대시보드에 직접 반영합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* 파일 선택 */}
          <div className="space-y-2">
            <Label>엑셀 파일</Label>
            {!file ? (
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
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
                    <p className="text-xs text-muted-foreground">
                      {headers.length}개 컬럼, {rowCount.toLocaleString()}개 행
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { resetState(); }}>변경</Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              hidden
            />
          </div>

          {/* 컬럼 매핑 영역 - 파일 선택 후 표시 */}
          {headers.length > 0 && (
            <>
              {/* 계정명 */}
              <div className="space-y-1.5">
                <Label>계정명 <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="예: 여비교통비"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">대시보드 트리의 최상위 분류명</p>
              </div>

              {/* 클러스터명 */}
              <div className="space-y-1.5">
                <Label>클러스터명 컬럼 <span className="text-red-500">*</span></Label>
                <Select value={clusterColumn} onValueChange={setClusterColumn}>
                  <SelectTrigger><SelectValue placeholder="컬럼 선택..." /></SelectTrigger>
                  <SelectContent>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 세부클러스터명 */}
              <div className="space-y-1.5">
                <Label>세부클러스터명 컬럼 <Badge variant="outline" className="ml-1 text-[10px]">선택</Badge></Label>
                <Select value={subClusterColumn || NONE_VALUE} onValueChange={v => setSubClusterColumn(v === NONE_VALUE ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="컬럼 선택..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>(없음)</SelectItem>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 금액 */}
              <div className="space-y-1.5">
                <Label>금액 컬럼 <span className="text-red-500">*</span></Label>
                <Select value={amountColumn} onValueChange={setAmountColumn}>
                  <SelectTrigger><SelectValue placeholder="컬럼 선택..." /></SelectTrigger>
                  <SelectContent>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 공급업체 */}
              <div className="space-y-1.5">
                <Label>공급업체 컬럼 <Badge variant="outline" className="ml-1 text-[10px]">선택</Badge></Label>
                <Select value={supplierColumn || NONE_VALUE} onValueChange={v => setSupplierColumn(v === NONE_VALUE ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="컬럼 선택..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>(없음)</SelectItem>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 코스트센터 */}
              <div className="space-y-1.5">
                <Label>코스트센터 컬럼 <Badge variant="outline" className="ml-1 text-[10px]">선택</Badge></Label>
                <Select value={costCenterColumn || NONE_VALUE} onValueChange={v => setCostCenterColumn(v === NONE_VALUE ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="컬럼 선택..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>(없음)</SelectItem>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 성공 결과 */}
          {result && (
            <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Import 완료</p>
                <p className="text-xs mt-1">
                  {result.totalRows?.toLocaleString()}행, {result.clusterCount}개 클러스터가 대시보드에 반영되었습니다.
                </p>
              </div>
            </div>
          )}

          {/* 하단 버튼 */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={uploading}>
              {result ? '닫기' : '취소'}
            </Button>
            {!result && (
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
