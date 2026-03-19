/**
 * RawDataModal - Raw Data 조회 모달 컴포넌트
 *
 * 비용 절감 대시보드에서 특정 항목의 원본 데이터를 페이지네이션으로 조회한다.
 * 서버에서 동적으로 컬럼 목록을 받아 테이블 헤더를 생성하며,
 * 행 번호, 페이지 크기 변경, 이전/다음 페이지 네비게이션을 지원한다.
 *
 * @param {boolean} open - 모달 표시 여부
 * @param {function} onClose - 닫기 콜백
 * @param {string} title - 모달 제목 (항목명)
 * @param {function} fetchRawData - (page, size) => Promise<{ columns, rows, totalCount, totalPages }>
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
export default function RawDataModal({ open, onClose, title, fetchRawData }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const loadData = useCallback(async (p, s) => {
    if (!fetchRawData) return;
    setLoading(true);
    try {
      const result = await fetchRawData(p, s);
      setData(result);
    } catch (err) {
      console.error('Failed to load raw data:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fetchRawData]);

  useEffect(() => {
    if (open && fetchRawData) {
      setPage(0);
      loadData(0, pageSize);
    }
  }, [open, fetchRawData, pageSize]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    loadData(newPage, pageSize);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(0);
    loadData(0, newSize);
  };

  const columns = data?.columns || [];
  const rows = data?.rows || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = data?.totalPages || 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Raw Data - {title}
          </DialogTitle>
          <DialogDescription>
            {totalCount > 0
              ? `전체 ${totalCount.toLocaleString()}건 중 ${(page * pageSize + 1).toLocaleString()}~${Math.min((page + 1) * pageSize, totalCount).toLocaleString()}건 표시`
              : '데이터가 없습니다'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">데이터 로딩 중...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              조회된 데이터가 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-center w-[60px] sticky left-0 bg-muted/50 z-10">#</TableHead>
                  {columns.map((col) => (
                    <TableHead key={col} className="whitespace-nowrap min-w-[120px]">
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={idx} className="text-sm">
                    <TableCell className="text-center text-xs text-muted-foreground tabular-nums sticky left-0 bg-background z-10">
                      {row._rowNumber ?? (page * pageSize + idx + 1)}
                    </TableCell>
                    {columns.map((col) => (
                      <TableCell key={col} className="whitespace-nowrap max-w-[300px] truncate">
                        {formatCellValue(row[col])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">페이지 크기:</span>
            <Select value={pageSize.toString()} onValueChange={(v) => handlePageSizeChange(+v)}>
              <SelectTrigger className="w-[80px] h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">
              총 {totalCount.toLocaleString()}건
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page === 0 || loading}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs px-2 tabular-nums">
              {totalPages > 0 ? `${page + 1} / ${totalPages}` : '0 / 0'}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages - 1 || loading}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => onClose(false)}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 셀 값 포맷팅: null → '-', 숫자 → 천단위 콤마, 기타 → 문자열 변환 */
function formatCellValue(value) {
  if (value == null) return '-';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}
