/**
 * 분석 시작 페이지 컴포넌트 (Step 2: Start Analysis)
 *
 * 업로드된 데이터의 초기 분석 설정을 수행하는 페이지이다.
 * 제거 열 설정(컬럼 가시성 토글), 데이터 삭제/원복(기준 열 값 기반),
 * 코스트센터/공급업체 명 표준화, 필수 항목 설정(세목/코스트센터/공급업체/금액/적요 열)
 * 기능을 제공한다. 완료 시 process_data를 비동기 생성하고 Step 3로 이동한다.
 *
 * @component
 */
// frontend/src/pages/startAnalysis/StartAnalysisPage.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Trash2, RotateCcw, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import uploadService from '../../services/uploadService';
import { useSessionEditorLock } from '../../hooks/useSessionEditorLock';
import useViewerMode from '../../hooks/useViewerMode';
import AdvancedTable from '@/components/AdvancedTable';
import ProgressDialog from '@/components/common/ProgressDialog';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

// shadcn/ui components
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ===== 멀티셀렉트 체크박스 리스트 컴포넌트 =====
// 드래그 선택 + Ctrl+클릭 복수 커서 지원
function MultiSelectCheckList({ items, checkedSet, onCheckedChange, renderLabel, getKey, className = '', disabled = false }) {
  const [cursorSet, setCursorSet] = useState(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(null);
  const listRef = useRef(null);

  const handleMouseDown = (e, key, idx) => {
    if (disabled) return;
    // Ctrl/Cmd 클릭: 개별 커서 토글
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setCursorSet(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }

    // 일반 클릭: 드래그 시작
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = idx;
    setCursorSet(new Set([key]));
  };

  const handleMouseEnter = (key, idx) => {
    if (!isDragging || dragStartRef.current === null) return;
    const startIdx = dragStartRef.current;
    const minIdx = Math.min(startIdx, idx);
    const maxIdx = Math.max(startIdx, idx);
    const newSet = new Set();
    for (let i = minIdx; i <= maxIdx; i++) {
      newSet.add(getKey(items[i]));
    }
    setCursorSet(newSet);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // 커서가 잡힌 항목의 체크 토글 → 커서 전체에 적용
  const handleCheckToggle = (key) => {
    if (disabled) return;
    if (cursorSet.size > 0 && cursorSet.has(key)) {
      // 커서가 잡힌 상태에서 그 중 하나를 체크/해제 → 전체 커서 항목 동시 적용
      const isCurrentlyChecked = checkedSet.has(key);
      const newChecked = new Set(checkedSet);
      cursorSet.forEach(k => {
        if (isCurrentlyChecked) newChecked.delete(k);
        else newChecked.add(k);
      });
      onCheckedChange(newChecked);
    } else {
      // 커서 없이 단독 체크 토글
      const newChecked = new Set(checkedSet);
      if (newChecked.has(key)) newChecked.delete(key);
      else newChecked.add(key);
      onCheckedChange(newChecked);
    }
  };

  return (
    <div ref={listRef} className={`select-none ${className}`} onMouseUp={handleMouseUp}>
      {items.map((item, idx) => {
        const key = getKey(item);
        const isCursor = cursorSet.has(key);
        const isChecked = checkedSet.has(key);
        return (
          <div
            key={key}
            className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors
              ${isCursor ? 'bg-blue-100 ring-1 ring-blue-300' : 'hover:bg-gray-50'}
              ${isChecked ? 'bg-blue-50' : ''}`}
            onMouseDown={(e) => handleMouseDown(e, key, idx)}
            onMouseEnter={() => handleMouseEnter(key, idx)}
          >
            <Checkbox
              checked={isChecked}
              onCheckedChange={() => handleCheckToggle(key)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              disabled={disabled}
            />
            {renderLabel(item, isChecked)}
          </div>
        );
      })}
    </div>
  );
}

export default function StartAnalysisPage() {
  const { projectId, sessionId } = useParams();
  const { isEditor, editorInfo } = useSessionEditorLock(projectId, sessionId);
  const navigate = useNavigate();
  const { isViewer } = useViewerMode(projectId);

  // ===== 상태 관리 =====
  const [sessionInfo, setSessionInfo] = useState({
    sessionName: '',
    totalRecords: 0,
    totalAmount: 0,
  });
  const [fileInfo, setFileInfo] = useState(null);

  // 데이터
  const [originalData, setOriginalData] = useState([]);
  const [sessionData, setSessionData] = useState([]);
  const [columns, setColumns] = useState([]);

  // 원본 테이블 접힘
  const [isOriginalCollapsed, setIsOriginalCollapsed] = useState(false);
  const originalPanelRef = useRef(null);

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(1000);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [loading, setLoading] = useState(false);

  // 탭 상태
  const [activeTab, setActiveTab] = useState('remove-columns');

  // ===== 제거 열 설정 (컬럼 매핑) =====
  const [columnMappings, setColumnMappings] = useState([]);
  const [columnCheckedSet, setColumnCheckedSet] = useState(new Set());

  // ===== 데이터 삭제 =====
  const [deleteBaseColumn, setDeleteBaseColumn] = useState('');
  const [deleteFilterKeyword, setDeleteFilterKeyword] = useState('');
  const [distinctVisible, setDistinctVisible] = useState([]);
  const [distinctHidden, setDistinctHidden] = useState([]);
  const [deleteCheckedSet, setDeleteCheckedSet] = useState(new Set());
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 표준화 설정
  const [standardKeyColumn, setStandardKeyColumn] = useState('');
  const [standardValueColumn, setStandardValueColumn] = useState('');
  const [standardData, setStandardData] = useState([]);
  const [standardLoading, setStandardLoading] = useState(false);

  // 필수 항목 설정
  const [requiredColumns, setRequiredColumns] = useState({
    category: '',
    costCenter: '',
    supplier: '',
    amount: '',
    target: '',
  });

  // ===== 파생 상태 =====
  const visibleColumns = useMemo(() => {
    if (columnMappings.length === 0) return columns;
    const visibleSet = new Set(
      columnMappings.filter(m => m.isVisible).map(m => m.originalName)
    );
    return columns.filter(col => visibleSet.has(col));
  }, [columns, columnMappings]);

  const availableRequiredColumns = useMemo(() => {
    return visibleColumns.filter(col => col !== '_id' && col !== 'row_number');
  }, [visibleColumns]);

  // 데이터 삭제 탭: 로컬 like 필터링
  // ★ String() 변환으로 숫자/기타 타입 값도 안전하게 처리
  const filteredVisibleValues = useMemo(() => {
    // __NULL__ 항목은 별도 UI로 표시하므로 리스트에서 제외
    const nonNullVisible = distinctVisible.filter(v => v.value !== '__NULL__');
    if (!deleteFilterKeyword.trim()) return nonNullVisible;
    const kw = deleteFilterKeyword.trim().toLowerCase();
    return nonNullVisible.filter(item =>
      String(item.value).toLowerCase().includes(kw)
    );
  }, [distinctVisible, deleteFilterKeyword]);

  const filteredHiddenValues = useMemo(() => {
    if (!deleteFilterKeyword.trim()) return distinctHidden;
    const kw = deleteFilterKeyword.trim().toLowerCase();
    return distinctHidden.filter(item =>
      String(item.value).toLowerCase().includes(kw)
    );
  }, [distinctHidden, deleteFilterKeyword]);

  useEffect(() => {
    if (originalPanelRef.current) {
      if (isOriginalCollapsed) {
        originalPanelRef.current.collapse();
      } else {
        originalPanelRef.current.expand();
      }
    }
  }, [isOriginalCollapsed]);

  // ===== useEffect - 세션 정보 + 파일 정보 로드 =====
  useEffect(() => {
    const loadSessionInfo = async () => {
      try {
        const session = await uploadService.getSession(projectId, sessionId);
        setSessionInfo({
          sessionName: session.sessionName || sessionId,
          totalRecords: session.totalRowCount || 0,
          totalAmount: session.totalAmount || 0,
        });
        if (session.uploadedFiles && session.uploadedFiles.length > 0) {
          setFileInfo(session.uploadedFiles[0]);
        }
        // 필수 항목 매핑 복원 (이전에 저장된 값이 있으면)
        if (session.categoryColumn || session.costCenterColumn || session.supplierColumn || session.amountColumn || session.targetColumn) {
          setRequiredColumns(prev => ({
            ...prev,
            category: session.categoryColumn || prev.category,
            costCenter: session.costCenterColumn || prev.costCenter,
            supplier: session.supplierColumn || prev.supplier,
            amount: session.amountColumn || prev.amount,
            target: session.targetColumn || prev.target,
          }));
        }
      } catch (error) {
        console.error('세션 정보 로드 실패:', error);
      }
    };
    loadSessionInfo();
  }, [projectId, sessionId]);

  // ===== 컬럼 매핑 로드 =====
  useEffect(() => {
    const loadColumnMappings = async () => {
      try {
        const mappings = await uploadService.getColumnMappings(projectId, sessionId);
        setColumnMappings(mappings);
        // columnCheckedSet = visible 컬럼들의 Set
        const checkedSet = new Set(
          mappings.filter(m => m.isVisible).map(m => m.originalName)
        );
        setColumnCheckedSet(checkedSet);
      } catch (error) {
        console.error('컬럼 매핑 로드 실패:', error);
      }
    };
    loadColumnMappings();
  }, [projectId, sessionId]);

  // ===== 필수 항목 자동 매핑 =====
  useEffect(() => {
    if (!fileInfo || columns.length === 0) return;

    const trimMatch = (cols, target) => {
      if (!target) return '';
      return cols.find(c => c.trim() === target.trim()) || '';
    };

    const containsMatch = (cols, keyword) => {
      return cols.find(c => c.trim().includes(keyword)) || '';
    };

    setRequiredColumns(prev => {
      const newCols = { ...prev };
      if (!newCols.category && fileInfo.accountColumnName) {
        newCols.category = trimMatch(columns, fileInfo.accountColumnName);
      }
      if (!newCols.amount && fileInfo.amountColumnName) {
        newCols.amount = trimMatch(columns, fileInfo.amountColumnName);
      }
      if (!newCols.costCenter) {
        newCols.costCenter = containsMatch(columns, '코스트센터');
      }
      if (!newCols.supplier) {
        newCols.supplier = containsMatch(columns, '공급업체');
      }
      if (!newCols.target) {
        newCols.target = containsMatch(columns, '적요') || containsMatch(columns, '타겟');
      }
      return newCols;
    });
  }, [fileInfo, columns]);

  // ===== 데이터 로드 =====
  const loadSessionData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await uploadService.getSessionData(
        projectId, sessionId, currentPage, pageSize
      );
      setColumns(result.columns || []);
      setOriginalData(result.data || []);
      setSessionData(result.data || []);
      setTotalRows(result.totalCount || 0);
      setTotalPages(result.totalPages || 0);
    } catch (error) {
      console.error('세션 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId, currentPage, pageSize]);

  useEffect(() => {
    loadSessionData();
  }, [loadSessionData]);

  // ===== 제거 열 설정 핸들러 =====
  const handleColumnCheckedChange = async (newCheckedSet) => {
    const prevSet = columnCheckedSet;
    setColumnCheckedSet(newCheckedSet);

    // 변경된 항목 찾기
    const updates = [];
    columnMappings.forEach(m => {
      const wasChecked = prevSet.has(m.originalName);
      const isNowChecked = newCheckedSet.has(m.originalName);
      if (wasChecked !== isNowChecked) {
        updates.push({ originalName: m.originalName, isVisible: isNowChecked });
      }
    });

    if (updates.length === 0) return;

    // UI 즉시 반영
    setColumnMappings(prev =>
      prev.map(m => ({
        ...m,
        isVisible: newCheckedSet.has(m.originalName),
      }))
    );

    // 서버 업데이트 (batch 단일 요청)
    setOperationLoading({ open: true, message: '컬럼 가시성 변경 중...' });
    try {
      await uploadService.updateColumnVisibilityBatch(projectId, sessionId, updates);
      // step_history: 데이터 변경 발생 → 현재 step(2) 저장
      uploadService.updateStepHistory(projectId, sessionId, 2).catch(() => {});
    } catch (error) {
      console.error('컬럼 가시성 변경 실패:', error);
      // 롤백
      setColumnCheckedSet(prevSet);
      setColumnMappings(prev =>
        prev.map(m => ({ ...m, isVisible: prevSet.has(m.originalName) }))
      );
    } finally {
      setOperationLoading({ open: false, message: '' });
    }
  };

  // ===== 데이터 삭제: 기준 열 선택 시 즉시 group-by 조회 =====
  const loadDistinctValues = useCallback(async (colName) => {
    if (!colName) {
      setDistinctVisible([]);
      setDistinctHidden([]);
      return;
    }
    setDeleteLoading(true);
    try {
      const result = await uploadService.getDistinctValuesWithStatus(projectId, sessionId, colName);
      // ★ 값을 문자열로 정규화하여 필터링/매칭 오류 방지
      const normalizeValues = (items) => (items || []).map(item => ({
        ...item,
        value: item.value != null ? String(item.value) : '__NULL__',
      }));
      setDistinctVisible(normalizeValues(result.visible));
      setDistinctHidden(normalizeValues(result.hidden));
      setDeleteCheckedSet(new Set());
      setDeleteFilterKeyword('');
      setShowHiddenItems(false);
    } catch (error) {
      console.error('고유 값 조회 실패:', error);
    } finally {
      setDeleteLoading(false);
    }
  }, [projectId, sessionId]);

  const handleDeleteBaseColumnChange = (colName) => {
    setDeleteBaseColumn(colName);
    loadDistinctValues(colName);
  };

  // 데이터 삭제 (선택된 값 기반) - WAF 제한 대응 배치 처리
  const handleDataDeleteByValues = async () => {
    if (isViewer) return;
    if (deleteCheckedSet.size === 0) {
      alert('삭제할 항목을 선택해주세요.');
      return;
    }
    setOperationLoading({ open: true, message: '데이터 삭제 중...' });
    try {
      const values = Array.from(deleteCheckedSet);
      const BATCH_SIZE = 50;
      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        const batch = values.slice(i, i + BATCH_SIZE);
        await uploadService.hideByColumnValues(projectId, sessionId, deleteBaseColumn, batch);
      }
      // visible → hidden으로 이동
      setDistinctVisible(prev => prev.filter(v => !deleteCheckedSet.has(v.value)));
      setDistinctHidden(prev => {
        const hiddenMap = new Map(prev.map(v => [v.value, v]));
        const movedItems = distinctVisible.filter(v => deleteCheckedSet.has(v.value));
        movedItems.forEach(item => {
          if (hiddenMap.has(item.value)) {
            hiddenMap.get(item.value).count += item.count;
          } else {
            hiddenMap.set(item.value, { ...item });
          }
        });
        return Array.from(hiddenMap.values());
      });
      setDeleteCheckedSet(new Set());
      loadSessionData();
      // step_history: 데이터 변경 발생 → 현재 step(2) 저장
      uploadService.updateStepHistory(projectId, sessionId, 2).catch(() => {});
    } catch (error) {
      console.error('데이터 삭제 실패:', error);
      alert('데이터 삭제에 실패했습니다.');
    } finally {
      setOperationLoading({ open: false, message: '' });
    }
  };

  // 데이터 원복 (hidden 항목 선택 기반) - WAF 제한 대응 배치 처리
  const handleDataRestoreByValues = async () => {
    if (isViewer) return;
    if (deleteCheckedSet.size === 0) {
      alert('원복할 항목을 선택해주세요.');
      return;
    }
    setOperationLoading({ open: true, message: '데이터 원복 중...' });
    try {
      const values = Array.from(deleteCheckedSet);
      const BATCH_SIZE = 50;
      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        const batch = values.slice(i, i + BATCH_SIZE);
        await uploadService.restoreByColumnValues(projectId, sessionId, deleteBaseColumn, batch);
      }
      // hidden → visible로 이동
      setDistinctHidden(prev => prev.filter(v => !deleteCheckedSet.has(v.value)));
      setDistinctVisible(prev => {
        const visibleMap = new Map(prev.map(v => [v.value, v]));
        const movedItems = distinctHidden.filter(v => deleteCheckedSet.has(v.value));
        movedItems.forEach(item => {
          if (visibleMap.has(item.value)) {
            visibleMap.get(item.value).count += item.count;
          } else {
            visibleMap.set(item.value, { ...item });
          }
        });
        return Array.from(visibleMap.values());
      });
      setDeleteCheckedSet(new Set());
      setShowHiddenItems(false);
      loadSessionData();
      // step_history: 데이터 변경 발생 → 현재 step(2) 저장
      uploadService.updateStepHistory(projectId, sessionId, 2).catch(() => {});
    } catch (error) {
      console.error('데이터 원복 실패:', error);
      alert('데이터 원복에 실패했습니다.');
    } finally {
      setOperationLoading({ open: false, message: '' });
    }
  };

  // 전체 선택/해제
  const handleDeleteSelectAll = (checked) => {
    if (showHiddenItems) {
      setDeleteCheckedSet(checked ? new Set(filteredHiddenValues.map(v => v.value)) : new Set());
    } else {
      const allValues = filteredVisibleValues.map(v => v.value);
      // null 항목이 있으면 포함
      if (distinctVisible.some(v => v.value === '__NULL__')) {
        allValues.push('__NULL__');
      }
      setDeleteCheckedSet(checked ? new Set(allValues) : new Set());
    }
  };

  // ===== 표준화 기능 =====
  const loadStandardizationData = useCallback(async () => {
    if (!standardKeyColumn || !standardValueColumn) {
      setStandardData([]);
      return;
    }
    if (standardKeyColumn === standardValueColumn) {
      setStandardData([]);
      return;
    }
    setStandardLoading(true);
    try {
      const result = await uploadService.groupByTwoColumns(
        projectId, sessionId, standardKeyColumn, standardValueColumn
      );
      setStandardData(result || []);
    } catch (error) {
      console.error('표준화 그룹바이 실패:', error);
    } finally {
      setStandardLoading(false);
    }
  }, [projectId, sessionId, standardKeyColumn, standardValueColumn]);

  useEffect(() => {
    loadStandardizationData();
  }, [loadStandardizationData]);

  const handleStandardize = async () => {
    if (isViewer) return;
    if (!standardKeyColumn || !standardValueColumn) {
      alert('Key 열과 변경 열을 모두 선택해주세요.');
      return;
    }
    if (standardKeyColumn === standardValueColumn) {
      alert('Key 열과 변경 열은 서로 다른 컬럼을 선택해야 합니다.');
      return;
    }
    if (!confirm('표준화를 수행하면 변경 열 데이터가 Key값별 최빈값으로 변경됩니다. 계속하시겠습니까?')) return;

    try {
      const result = await uploadService.standardizeData(
        projectId, sessionId, standardKeyColumn, standardValueColumn
      );
      alert(`표준화 완료: ${result.keysStandardized}개 Key, ${result.totalUpdated}건 변경`);
      // 테이블 새로고침 + 표준화 테이블 새로고침
      loadSessionData();
      loadStandardizationData();
      // step_history: 데이터 변경 발생 → 현재 step(2) 저장
      uploadService.updateStepHistory(projectId, sessionId, 2).catch(() => {});
    } catch (error) {
      console.error('표준화 실패:', error);
      alert('표준화에 실패했습니다.');
    }
  };

  // ===== 필수 항목 설정 - 중복 방지 =====
  const getUsedRequiredColumns = (excludeKey) => {
    return Object.entries(requiredColumns)
      .filter(([key]) => key !== excludeKey)
      .map(([, value]) => value)
      .filter(Boolean);
  };

  // 테이블 정렬
  const [origSort, setOrigSort] = useState(null);
  const [processedSort, setProcessedSort] = useState(null);

  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeProgress, setCompleteProgress] = useState(0);

  // 미선택 컬럼 안내 다이얼로그
  const [missingColumnsDialog, setMissingColumnsDialog] = useState({ open: false, missing: [] });

  // 작업 진행 중 로딩 다이얼로그 (데이터 삭제/원복, 컬럼 가시성 변경)
  const [operationLoading, setOperationLoading] = useState({ open: false, message: '' });

  const handleComplete = async () => {
    if (isViewer) return;
    // 필수 항목 검증 - 모든 컬럼 체크
    const columnLabels = {
      category: '세목 열',
      costCenter: '코스트센터 열',
      supplier: '공급업체 열',
      amount: '금액 열',
      target: '적요 열',
    };
    const missingCols = Object.entries(columnLabels)
      .filter(([key]) => !requiredColumns[key])
      .map(([, label]) => label);

    if (missingCols.length > 0) {
      setMissingColumnsDialog({ open: true, missing: missingCols });
      return;
    }

    setCompleteLoading(true);
    setCompleteProgress(0);
    try {
      // process_data 비동기 생성 시작
      await uploadService.prepareProcessData(projectId, sessionId, requiredColumns);

      // 폴링으로 진행 상태 추적
      const pollInterval = 1000; // 1초
      const maxPolls = 300; // 최대 5분
      let polls = 0;

      while (polls < maxPolls) {
        await new Promise(r => setTimeout(r, pollInterval));
        polls++;

        const status = await uploadService.getProcessDataStatus(projectId, sessionId);
        setCompleteProgress(status.progress || 0);

        if (status.status === 'COMPLETED') {
          console.log('process_data 생성 완료:', status);
          // step_history: 완료 → 다음 step(3) 저장
          await uploadService.updateStepHistory(projectId, sessionId, 3);
          navigate(`/projects/${projectId}/sessions/${sessionId}/preprocessing`);
          return;
        } else if (status.status === 'FAILED') {
          throw new Error(status.error || '데이터 처리에 실패했습니다.');
        }
      }
      throw new Error('처리 시간이 초과되었습니다.');
    } catch (error) {
      console.error('process_data 생성 실패:', error);
      alert(error.message || '데이터 처리에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setCompleteLoading(false);
      setCompleteProgress(0);
    }
  };

  // ===== AdvancedTable 컬럼 빌드 =====
  const tableColumns = useMemo(() => {
    return visibleColumns.map(col => ({
      key: col,
      label: col,
      sortable: true,
      minWidth: 60,
      render: (row) => {
        const val = row[col];
        if (val == null) return '';
        if (typeof val === 'number') {
          if (Number.isInteger(val)) return <span className="whitespace-nowrap">{val.toLocaleString()}</span>;
          if (val === Math.floor(val)) return <span className="whitespace-nowrap">{Math.round(val).toLocaleString()}</span>;
          return <span className="whitespace-nowrap">{val.toLocaleString()}</span>;
        }
        if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) {
          const num = Number(val);
          if (Number.isInteger(num) || num === Math.floor(num)) return <span className="whitespace-nowrap">{Math.round(num).toLocaleString()}</span>;
          return <span className="whitespace-nowrap">{num.toLocaleString()}</span>;
        }
        return <span className="whitespace-nowrap">{String(val)}</span>;
      },
    }));
  }, [visibleColumns]);

  // ===== 프론트 정렬 =====
  const sortDataFn = useCallback((data, sort) => {
    if (!sort) return data;
    const sorted = [...data];
    sorted.sort((a, b) => {
      const aVal = a[sort.field];
      const bVal = b[sort.field];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sort.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return sorted;
  }, []);

  const sortedOriginalData = useMemo(() => sortDataFn(originalData, origSort), [originalData, origSort, sortDataFn]);
  const sortedSessionData = useMemo(() => sortDataFn(sessionData, processedSort), [sessionData, processedSort, sortDataFn]);

  // ===== 렌더링 =====
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">

        {!isEditor && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">
                    뷰어 모드 - {editorInfo?.editorUserName || '다른 사용자'}님이 편집 중입니다
                </span>
            </div>
        )}

        {/* 상단 헤더 (고정) */}
        <div className="flex-shrink-0 space-y-4 mb-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/projects">
                  <Home className="h-4 w-4" />
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/projects/${projectId}/upload`}>
                  프로젝트
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold">
                  Step 2: Start Analysis
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{sessionInfo.sessionName}</span>
                <div className="text-sm font-normal text-muted-foreground">
                  총 {totalRows.toLocaleString()}건 / 합계: {sessionInfo.totalAmount.toLocaleString()}원
                </div>
              </CardTitle>
            </CardHeader>
            {isViewer && (
              <div className="mx-4 mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium">
                뷰어 권한: 조회만 가능합니다. 데이터 수정이 불가합니다.
              </div>
            )}
          </Card>
        </div>

        {/* 메인 콘텐츠 그리드 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 xl:grid-rows-[1fr] gap-4 overflow-y-auto xl:overflow-hidden">

          {/* 좌측: 테이블 영역 (8/12) */}
          <div className="xl:col-span-8 min-h-[50vh] xl:min-h-0 xl:h-full flex flex-col">

            <PanelGroup orientation="vertical" className="flex-1 min-h-0">
              <Panel panelRef={originalPanelRef} defaultSize={50} minSize={5} collapsible={true} collapsedSize={5}>
                {/* 1. 원본 테이블 */}
                <Card className="h-full overflow-hidden transition-all duration-300 shadow-sm flex flex-col">
                  <CardHeader
                    className="py-3 px-4 border-b bg-white cursor-pointer hover:bg-gray-50 transition-colors flex-shrink-0"
                    onClick={() => setIsOriginalCollapsed(!isOriginalCollapsed)}
                  >
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>원본 데이터 <span className="text-xs font-normal text-gray-500 ml-2">(클릭하여 {isOriginalCollapsed ? '펼치기' : '접기'})</span></span>
                      {isOriginalCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>

                  {!isOriginalCollapsed && (
                    <CardContent className="p-0 flex-1 min-h-0">
                      <AdvancedTable
                        columns={tableColumns}
                        data={sortedOriginalData}
                        rowKey={(row, idx) => row._id || idx}
                        sort={origSort}
                        onSortChange={(field, direction) => setOrigSort({ field, direction })}
                        loading={loading}
                      />
                    </CardContent>
                  )}
                </Card>
              </Panel>

              <PanelResizeHandle className="h-2 flex items-center justify-center group cursor-row-resize">
                <div className="w-12 h-1 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
              </PanelResizeHandle>

              <Panel defaultSize={50} minSize={20}>
                {/* 2. 가공 데이터 테이블 */}
                <Card className="h-full overflow-hidden flex flex-col min-h-0 shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                <CardTitle className="text-base">가공 데이터</CardTitle>
              </CardHeader>

              <CardContent className="flex-1 p-0 min-h-0 flex flex-col">
                  <AdvancedTable
                    columns={tableColumns}
                    data={sortedSessionData}
                    rowKey={(row, idx) => row._id || idx}
                    sort={processedSort}
                    onSortChange={(field, direction) => setProcessedSort({ field, direction })}
                    loading={loading}
                    rowClassName={(row) => row._isHidden ? 'bg-gray-100 opacity-50 line-through' : ''}
                  />
              </CardContent>

              {/* 페이지네이션 */}
              <div className="p-3 border-t bg-white flex-shrink-0">
                <div className="flex items-center justify-between text-xs">
                  <div className="text-muted-foreground hidden sm:block">
                    {(currentPage * pageSize + 1).toLocaleString()} - {Math.min((currentPage + 1) * pageSize, totalRows).toLocaleString()} / 총 {totalRows.toLocaleString()}건
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(value) => {
                        setPageSize(Number(value));
                        setCurrentPage(0);
                      }}
                    >
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="100">100개씩</SelectItem>
                        <SelectItem value="500">500개씩</SelectItem>
                        <SelectItem value="1000">1000개씩</SelectItem>
                        <SelectItem value="5000">5000개씩</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(0)} disabled={currentPage === 0}>
                        처음
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                        disabled={currentPage === 0}
                      >
                        이전
                      </Button>
                      <span className="flex items-center px-2 text-xs font-medium">
                        {currentPage + 1} / {totalPages || 1}
                      </span>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                        disabled={currentPage >= totalPages - 1}
                      >
                        다음
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setCurrentPage(totalPages - 1)} disabled={currentPage >= totalPages - 1}>
                        마지막
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
                </Card>
              </Panel>
            </PanelGroup>
          </div>

          {/* 우측: 설정 패널 (4/12) */}
          <div className="xl:col-span-4 min-h-[40vh] xl:min-h-0 xl:h-full flex flex-col">

            {/* 설정 패널 (스크롤 가능 영역) */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              {/* 제거 열 설정 / 데이터 삭제 탭 */}
              <Card>
                <CardContent className="pt-4 px-4 pb-4">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                      <TabsTrigger value="remove-columns">제거 열 설정</TabsTrigger>
                      <TabsTrigger value="delete-data">데이터 삭제</TabsTrigger>
                    </TabsList>

                    {/* ===== 제거 열 설정 탭 ===== */}
                    <TabsContent value="remove-columns" className="space-y-3 mt-0">
                      <p className="text-xs text-muted-foreground">
                        체크 해제 시 해당 컬럼이 테이블에서 숨겨집니다. 드래그 또는 Ctrl+클릭으로 여러 항목을 선택한 후 한번에 체크/해제할 수 있습니다.
                      </p>
                      <div className="border rounded-md p-2 max-h-[300px] overflow-y-auto bg-white">
                        <MultiSelectCheckList
                          items={columnMappings}
                          checkedSet={columnCheckedSet}
                          onCheckedChange={handleColumnCheckedChange}
                          getKey={(item) => item.originalName}
                          renderLabel={(item, isChecked) => (
                            <span className={`text-sm flex-1 ${!isChecked ? 'text-gray-400 line-through' : ''}`}>
                              {item.originalName}
                            </span>
                          )}
                          disabled={isViewer}
                        />
                        {columnMappings.length === 0 && (
                          <p className="text-xs text-gray-400 p-2">컬럼 정보가 없습니다.</p>
                        )}
                      </div>
                    </TabsContent>

                    {/* ===== 데이터 삭제 탭 ===== */}
                    <TabsContent value="delete-data" className="space-y-3 mt-0">
                      <div>
                        <label className="text-xs font-medium mb-1.5 block">기준 열 선택</label>
                        <Select value={deleteBaseColumn} onValueChange={handleDeleteBaseColumnChange} disabled={isViewer}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="데이터 삭제 기준 열 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {visibleColumns.filter(c => c !== '_id' && c !== 'row_number').map((col) => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 로컬 필터 검색 */}
                      {deleteBaseColumn && (distinctVisible.length > 0 || distinctHidden.length > 0) && (
                        <Input
                          className="h-9"
                          placeholder="항목 검색 (like 필터)"
                          value={deleteFilterKeyword}
                          onChange={(e) => setDeleteFilterKeyword(e.target.value)}
                        />
                      )}

                      {deleteLoading && (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs py-4">
                          <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
                          조회 중...
                        </div>
                      )}

                      {/* Visible 항목 리스트 */}
                      {!deleteLoading && deleteBaseColumn && !showHiddenItems && (
                        <>
                          {(filteredVisibleValues.length > 0 || distinctVisible.some(v => v.value === '__NULL__')) && (
                            <>
                              {/* null 값 항목 체크박스 */}
                              {distinctVisible.some(v => v.value === '__NULL__') && (
                                <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md mb-2">
                                  <Checkbox
                                    id="select-null-values"
                                    checked={deleteCheckedSet.has('__NULL__')}
                                    onCheckedChange={(checked) => {
                                      const newSet = new Set(deleteCheckedSet);
                                      if (checked) newSet.add('__NULL__');
                                      else newSet.delete('__NULL__');
                                      setDeleteCheckedSet(newSet);
                                    }}
                                    disabled={isViewer}
                                  />
                                  <label htmlFor="select-null-values" className="text-xs cursor-pointer text-yellow-800 font-medium">
                                    (null/빈 값) — {distinctVisible.find(v => v.value === '__NULL__')?.count || 0}건
                                  </label>
                                </div>
                              )}

                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id="select-all-visible"
                                    checked={deleteCheckedSet.size > 0 && deleteCheckedSet.size === filteredVisibleValues.length + (distinctVisible.some(v => v.value === '__NULL__') ? 1 : 0)}
                                    onCheckedChange={handleDeleteSelectAll}
                                    disabled={isViewer}
                                  />
                                  <label htmlFor="select-all-visible" className="text-xs cursor-pointer">
                                    전체 선택 ({filteredVisibleValues.length}건)
                                  </label>
                                </div>
                                {distinctHidden.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7 text-orange-600"
                                    onClick={() => { setShowHiddenItems(true); setDeleteCheckedSet(new Set()); }}
                                  >
                                    삭제된 항목 보기 ({distinctHidden.length})
                                  </Button>
                                )}
                              </div>

                              <div className="border rounded-md max-h-[250px] overflow-y-auto bg-white p-1">
                                <MultiSelectCheckList
                                  items={filteredVisibleValues}
                                  checkedSet={deleteCheckedSet}
                                  onCheckedChange={setDeleteCheckedSet}
                                  getKey={(item) => item.value}
                                  renderLabel={(item) => (
                                    <span className="text-xs flex-1 flex justify-between">
                                      <span className="truncate">{item.value}</span>
                                      <span className="text-gray-400 ml-2 flex-shrink-0">({item.count})</span>
                                    </span>
                                  )}
                                  disabled={isViewer}
                                />
                              </div>
                            </>
                          )}

                          {filteredVisibleValues.length === 0 && !deleteLoading && (
                            <div className="text-center py-4">
                              <p className="text-xs text-gray-400">
                                {distinctVisible.length === 0 ? '데이터가 없습니다.' : '검색 결과가 없습니다.'}
                              </p>
                              {distinctHidden.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-7 text-orange-600 mt-1"
                                  onClick={() => { setShowHiddenItems(true); setDeleteCheckedSet(new Set()); }}
                                >
                                  삭제된 항목 보기 ({distinctHidden.length})
                                </Button>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button
                              variant="destructive"
                              className="flex-1 h-9"
                              onClick={handleDataDeleteByValues}
                              disabled={deleteCheckedSet.size === 0 || isViewer}
                            >
                              <Trash2 className="h-4 w-4 mr-1" /> 데이터 삭제 ({deleteCheckedSet.size})
                            </Button>
                          </div>
                        </>
                      )}

                      {/* Hidden 항목 리스트 (원복 모드) */}
                      {!deleteLoading && deleteBaseColumn && showHiddenItems && (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="select-all-hidden"
                                checked={deleteCheckedSet.size > 0 && deleteCheckedSet.size === filteredHiddenValues.length}
                                onCheckedChange={handleDeleteSelectAll}
                                disabled={isViewer}
                              />
                              <label htmlFor="select-all-hidden" className="text-xs cursor-pointer text-orange-700">
                                삭제된 항목 ({filteredHiddenValues.length}건)
                              </label>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => { setShowHiddenItems(false); setDeleteCheckedSet(new Set()); }}
                            >
                              목록으로 돌아가기
                            </Button>
                          </div>

                          {filteredHiddenValues.length > 0 ? (
                            <div className="border border-orange-200 rounded-md max-h-[250px] overflow-y-auto bg-orange-50 p-1">
                              <MultiSelectCheckList
                                items={filteredHiddenValues}
                                checkedSet={deleteCheckedSet}
                                onCheckedChange={setDeleteCheckedSet}
                                getKey={(item) => item.value}
                                renderLabel={(item) => (
                                  <span className="text-xs flex-1 flex justify-between text-orange-800">
                                    <span className="truncate line-through">{item.value}</span>
                                    <span className="text-orange-400 ml-2 flex-shrink-0">({item.count})</span>
                                  </span>
                                )}
                                disabled={isViewer}
                              />
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 text-center py-2">삭제된 항목이 없습니다.</p>
                          )}

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1 h-9 border-orange-300 text-orange-700 hover:bg-orange-50"
                              onClick={handleDataRestoreByValues}
                              disabled={deleteCheckedSet.size === 0 || isViewer}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" /> 데이터 원복 ({deleteCheckedSet.size})
                            </Button>
                          </div>
                        </>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* 표준화 설정 */}
              <Card>
                <CardHeader className="py-3 px-4 border-b">
                  <CardTitle className="text-sm font-bold">코스트센터/공급업체 명 표준화</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 px-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Key 열</label>
                      <Select value={standardKeyColumn} onValueChange={(v) => { setStandardKeyColumn(v); if (v === standardValueColumn) setStandardValueColumn(''); }} disabled={isViewer}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {visibleColumns.filter(c => c !== '_id' && c !== 'row_number' && c !== standardValueColumn).map((col) => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">변경 열</label>
                      <Select value={standardValueColumn} onValueChange={(v) => { setStandardValueColumn(v); if (v === standardKeyColumn) setStandardKeyColumn(''); }} disabled={isViewer}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {visibleColumns.filter(c => c !== '_id' && c !== 'row_number' && c !== standardKeyColumn).map((col) => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="border rounded-md overflow-hidden max-h-[200px] overflow-y-auto bg-white">
                    <Table>
                      <TableHeader className="bg-gray-100 sticky top-0">
                        <TableRow>
                          <TableHead className="text-xs h-8">Key 값</TableHead>
                          <TableHead className="text-xs h-8">대상값</TableHead>
                          <TableHead className="text-xs h-8 w-16 text-center">Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {standardLoading ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-4">
                              <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
                                <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
                                조회 중...
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : standardData.length > 0 ? (
                          standardData.map((row, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-xs py-1">{row.keyValue}</TableCell>
                              <TableCell className="text-xs py-1">{row.changeValue}</TableCell>
                              <TableCell className="text-xs py-1 text-center">{row.count}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-xs text-gray-400 text-center py-4">
                              {standardKeyColumn && standardValueColumn
                                ? '그룹바이 결과가 없습니다.'
                                : 'Key 열과 변경 열을 선택해주세요.'}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <Button
                    className="w-full h-8 text-xs"
                    onClick={handleStandardize}
                    disabled={!standardKeyColumn || !standardValueColumn || standardData.length === 0 || standardLoading || isViewer}
                  >
                    표준화 수행
                  </Button>
                </CardContent>
              </Card>

              {/* 필수 항목 설정 */}
              <Card>
                <CardHeader className="py-3 px-4 border-b">
                  <CardTitle className="text-sm font-bold">필수 항목 설정</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 px-4 space-y-2">
                  {[
                    { label: '세목 열', key: 'category' },
                    { label: '코스트센터 열', key: 'costCenter' },
                    { label: '공급업체 열', key: 'supplier' },
                    { label: '금액 열', key: 'amount' },
                    { label: '적요 열', key: 'target' },
                  ].map((field) => {
                    const usedCols = getUsedRequiredColumns(field.key);
                    const selectableCols = availableRequiredColumns.filter(
                      col => !usedCols.includes(col)
                    );
                    const currentValue = requiredColumns[field.key];
                    const isCurrentValid = currentValue && availableRequiredColumns.includes(currentValue);

                    return (
                      <div key={field.key} className="flex items-center justify-between">
                        <label className="text-xs font-medium w-24">{field.label}</label>
                        <Select
                          value={isCurrentValid ? currentValue : ''}
                          onValueChange={(value) =>
                            setRequiredColumns(prev => ({ ...prev, [field.key]: value }))
                          }
                          disabled={isViewer}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectableCols.map((col) => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* 완료 버튼 (하단 고정) */}
            <div className="pt-3 mt-auto flex-shrink-0 z-20 bg-gray-50 pb-2">
              {completeLoading && completeProgress > 0 && (
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>process_data 생성 중...</span>
                    <span>{completeProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${completeProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold"
                onClick={handleComplete}
                disabled={completeLoading || isViewer}
              >
                {completeLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    {completeProgress > 0 ? `처리 중... ${completeProgress}%` : '시작 중...'}
                  </div>
                ) : (
                  '완료 → Step 3: Preprocessing'
                )}
              </Button>
            </div>

          </div>
        </div>

        {/* 작업 진행 중 로딩 다이얼로그 (데이터 삭제/원복, 컬럼 가시성 변경) */}
        <ProgressDialog
          open={operationLoading.open}
          message={operationLoading.message}
        />

        {/* 미선택 컬럼 안내 다이얼로그 */}
        <Dialog open={missingColumnsDialog.open} onOpenChange={(open) => setMissingColumnsDialog(prev => ({ ...prev, open }))}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                필수 항목 미선택 안내
              </DialogTitle>
              <DialogDescription className="pt-2">
                다음 항목이 아직 선택되지 않았습니다. 모든 필수 항목을 선택해주세요.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <ul className="list-disc pl-5 space-y-1">
                {missingColumnsDialog.missing.map((col) => (
                  <li key={col} className="text-sm font-medium text-red-600">{col}</li>
                ))}
              </ul>
            </div>
            <DialogFooter>
              <Button onClick={() => setMissingColumnsDialog({ open: false, missing: [] })}>
                확인
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
