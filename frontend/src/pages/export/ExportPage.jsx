// frontend/src/pages/export/ExportPage.jsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Home, Download, Trash2, Eye, RefreshCw,
  CheckSquare, Square, Edit3, Save, X, ExternalLink, AlertTriangle, Lock, Loader2
} from 'lucide-react';
import { useSessionEditorLock } from '../../hooks/useSessionEditorLock';

// shadcn/ui components
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

// Services
import exportService from '@/services/exportService';
import costReductionService from '@/services/costReductionService';
import useViewerMode from '../../hooks/useViewerMode';

// Shared component
import AdvancedTable from '@/components/AdvancedTable';

// ===== 멀티셀렉트 체크박스 리스트 컴포넌트 =====
// 드래그 선택 + Ctrl+클릭 복수 커서 지원
function MultiSelectCheckList({ items, checkedSet, onCheckedChange, renderLabel, getKey, className = '', disabled = false }) {
  const [cursorSet, setCursorSet] = useState(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(null);
  const listRef = useRef(null);

  const handleMouseDown = (e, key, idx) => {
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

  const handleCheckToggle = (key) => {
    if (cursorSet.size > 0 && cursorSet.has(key)) {
      const isCurrentlyChecked = checkedSet.has(key);
      const newChecked = new Set(checkedSet);
      cursorSet.forEach(k => {
        if (isCurrentlyChecked) newChecked.delete(k);
        else newChecked.add(k);
      });
      onCheckedChange(newChecked);
    } else {
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

function ExportPage() {
  const { projectId, sessionId } = useParams();
  const { isEditor, editorInfo } = useSessionEditorLock(projectId, sessionId);
  const navigate = useNavigate();
  const { isViewer } = useViewerMode(projectId);

  // ===== 상태 관리 =====
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 전체 데이터 탭
  const [allData, setAllData] = useState([]);
  const [allDataColumns, setAllDataColumns] = useState([]);
  const [allDataPage, setAllDataPage] = useState(0);
  const [allDataPageSize, setAllDataPageSize] = useState(100);
  const [allDataTotalCount, setAllDataTotalCount] = useState(0);
  const [allDataTotalPages, setAllDataTotalPages] = useState(0);
  const [allDataSort, setAllDataSort] = useState(null);

  // Clustering 결과 탭
  const [clusterData, setClusterData] = useState([]);
  const [clusterCheckedSet, setClusterCheckedSet] = useState(new Set());
  const [editingCluster, setEditingCluster] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingSubCluster, setEditingSubCluster] = useState(null);
  const [editingSubName, setEditingSubName] = useState('');

  // 클러스터별 세부 항목 탭
  const [detailData, setDetailData] = useState([]);
  const [detailColumns, setDetailColumns] = useState([]);
  const [detailPage, setDetailPage] = useState(0);
  const [detailPageSize, setDetailPageSize] = useState(100);
  const [detailTotalCount, setDetailTotalCount] = useState(0);
  const [detailTotalPages, setDetailTotalPages] = useState(0);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [detailSort, setDetailSort] = useState(null);

  // 제거열 설정
  const [columnSettings, setColumnSettings] = useState([]);
  const [columnCheckedSet, setColumnCheckedSet] = useState(new Set());

  // 드래그 선택
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(null);

  // 우측 탭
  const [rightTab, setRightTab] = useState('clustering');

  // ===== 초기 로드 =====
  useEffect(() => {
    loadInitialData();
  }, [sessionId]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadAllData(0, allDataPageSize),
        loadClusterData(),
        loadColumnSettings(),
      ]);
    } catch (e) {
      console.error('데이터 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  // ===== 전체 데이터 로드 =====
  const loadAllData = async (page, size) => {
    try {
      const result = await exportService.getAllDataWithClusterInfo(projectId, sessionId, page, size);
      setAllData(result.data || []);
      setAllDataColumns(result.columns || []);
      setAllDataTotalCount(result.totalCount || 0);
      setAllDataTotalPages(result.totalPages || 0);
      setAllDataPage(page);
    } catch (e) {
      console.error('전체 데이터 로드 실패:', e);
    }
  };

  // ===== Clustering 결과 로드 =====
  const loadClusterData = async () => {
    try {
      const result = await exportService.getMergedClustersWithSubClusters(projectId, sessionId);
      setClusterData(result || []);
    } catch (e) {
      console.error('클러스터 데이터 로드 실패:', e);
    }
  };

  // ===== 클러스터별 상세 데이터 로드 =====
  const loadClusterDetail = async (clusterNumber, page = 0, size = 100) => {
    try {
      const result = await exportService.getClusterDetailData(projectId, sessionId, clusterNumber, page, size);
      setDetailData(result.data || []);
      setDetailColumns(result.columns || []);
      setDetailTotalCount(result.totalCount || 0);
      setDetailTotalPages(result.totalPages || 0);
      setDetailPage(page);
      setSelectedCluster({ number: clusterNumber, name: result.clusterName });
    } catch (e) {
      console.error('상세 데이터 로드 실패:', e);
    }
  };

  // ===== 컬럼 설정 로드 =====
  const loadColumnSettings = async () => {
    try {
      const result = await exportService.getColumnSettings(projectId, sessionId);
      setColumnSettings(result || []);
      const checkedSet = new Set(
        (result || []).filter(c => c.isVisible).map(c => c.originalName)
      );
      setColumnCheckedSet(checkedSet);
    } catch (e) {
      console.error('컬럼 설정 로드 실패:', e);
    }
  };

  // ===== 클러스터명 수정 =====
  const handleEditClusterName = (cluster) => {
    setEditingCluster(cluster.clusterNumber);
    setEditingName(cluster.clusterName || '');
  };

  const handleSaveClusterName = async (clusterNumber) => {
    if (isViewer) return;
    try {
      await exportService.updateClusterName(projectId, sessionId, clusterNumber, editingName);
      setClusterData(prev => prev.map(c =>
        c.clusterNumber === clusterNumber ? { ...c, clusterName: editingName } : c
      ));
      setEditingCluster(null);
      setEditingName('');
    } catch (e) {
      alert('클러스터명 수정 실패: ' + (e.response?.data?.message || e.message));
    }
  };

  const handleCancelEdit = () => {
    setEditingCluster(null);
    setEditingName('');
  };

  // ===== 세부클러스터명 수정 =====
  const handleEditSubClusterName = (cluster) => {
    setEditingSubCluster(cluster.clusterNumber);
    setEditingSubName(cluster.subClusterName || '');
  };

  const handleSaveSubClusterName = async (clusterNumber) => {
    if (isViewer) return;
    try {
      await exportService.updateClusterName(projectId, sessionId, clusterNumber, editingSubName);
      setClusterData(prev => prev.map(c =>
        c.clusterNumber === clusterNumber ? { ...c, subClusterName: editingSubName } : c
      ));
      setEditingSubCluster(null);
      setEditingSubName('');
    } catch (e) {
      alert('세부클러스터명 수정 실패: ' + (e.response?.data?.message || e.message));
    }
  };

  const handleCancelSubEdit = () => {
    setEditingSubCluster(null);
    setEditingSubName('');
  };

  // ===== 체크박스 토글 =====
  const handleClusterCheck = (clusterNumber) => {
    setClusterCheckedSet(prev => {
      const next = new Set(prev);
      next.has(clusterNumber) ? next.delete(clusterNumber) : next.add(clusterNumber);
      return next;
    });
  };

  const handleSelectAllClusters = (checked) => {
    if (checked) {
      const parentNumbers = clusterData.filter(c => c.isParentRow).map(c => c.clusterNumber);
      setClusterCheckedSet(new Set(parentNumbers));
    } else {
      setClusterCheckedSet(new Set());
    }
  };

  // ===== 드래그 선택 =====
  const handleRowMouseDown = (e, clusterNumber) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = clusterNumber;

    if (e.ctrlKey || e.metaKey) {
      handleClusterCheck(clusterNumber);
    } else {
      setClusterCheckedSet(new Set([clusterNumber]));
    }
  };

  const handleRowMouseEnter = (clusterNumber) => {
    if (!isDragging) return;
    setClusterCheckedSet(prev => new Set([...prev, clusterNumber]));
  };

  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // ===== 컬럼 설정 변경 (즉시 적용 + DB 업데이트) =====
  const handleColumnCheckedChange = async (newCheckedSet) => {
    const prevSet = columnCheckedSet;
    setColumnCheckedSet(newCheckedSet);

    // 변경된 항목 찾기
    const updates = [];
    columnSettings.forEach(c => {
      const wasChecked = prevSet.has(c.originalName);
      const isNowChecked = newCheckedSet.has(c.originalName);
      if (wasChecked !== isNowChecked) {
        updates.push({ originalName: c.originalName, isVisible: isNowChecked });
      }
    });

    if (updates.length === 0) return;

    // UI 즉시 반영
    setColumnSettings(prev =>
      prev.map(c => ({
        ...c,
        isVisible: newCheckedSet.has(c.originalName),
      }))
    );

    // 서버 업데이트
    try {
      await exportService.updateColumnSettings(projectId, sessionId, updates);
      // 데이터 새로고침
      await loadAllData(allDataPage, allDataPageSize);
      if (selectedCluster) {
        await loadClusterDetail(selectedCluster.number, detailPage, detailPageSize);
      }
    } catch (e) {
      console.error('컬럼 가시성 변경 실패:', e);
      // 롤백
      setColumnCheckedSet(prevSet);
      setColumnSettings(prev =>
        prev.map(c => ({ ...c, isVisible: prevSet.has(c.originalName) }))
      );
    }
  };

  // ===== Export =====
  const [exportProgress, setExportProgress] = useState(0);
  const [exportingType, setExportingType] = useState(null); // 'selected' | 'all'

  const handleExportSelected = async () => {
    if (isViewer) return;
    if (clusterCheckedSet.size === 0) {
      alert('Export할 클러스터를 선택해주세요.');
      return;
    }
    setExporting(true);
    setExportingType('selected');
    setExportProgress(10);
    try {
      setExportProgress(30);
      const result = await exportService.exportSelectedClusters(
        projectId, sessionId, Array.from(clusterCheckedSet)
      );
      setExportProgress(80);
      if (result.downloadUrl) {
        exportService.downloadExcel(result.downloadUrl, `clusters_${sessionId}.xlsx`);
      }
      setExportProgress(100);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      alert('Export 실패: ' + (e.response?.data?.message || e.message));
    } finally {
      setExporting(false);
      setExportingType(null);
      setExportProgress(0);
    }
  };

  const handleExportAll = async () => {
    if (isViewer) return;
    if (!window.confirm('전체 클러스터를 Excel로 내보내시겠습니까?')) return;
    setExporting(true);
    setExportingType('all');
    setExportProgress(10);
    try {
      setExportProgress(30);
      const result = await exportService.exportAllClusters(projectId, sessionId);
      setExportProgress(80);
      if (result.downloadUrl) {
        exportService.downloadExcel(result.downloadUrl, `all_clusters_${sessionId}.xlsx`);
      }
      setExportProgress(100);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      alert('Export 실패: ' + (e.response?.data?.message || e.message));
    } finally {
      setExporting(false);
      setExportingType(null);
      setExportProgress(0);
    }
  };

  // ===== 세션 완료 =====
  const [completeDialog, setCompleteDialog] = useState({
    open: false,
    type: null, // 'blocked' | 'confirm_reset' | 'confirm_normal'
    editorUserName: null,
    hasExport: false,
  });

  const handleCompleteSession = async () => {
    console.log('[세션완료] handleCompleteSession 호출', { isViewer, exporting, isEditor });
    if (isViewer) {
      console.warn('[세션완료] isViewer=true → 차단됨');
      return;
    }
    try {
      // 1. 대시보드 잠금 상태 확인 (5초 타임아웃)
      let lockStatus = { dashboardExists: false };
      try {
        const lockPromise = costReductionService.checkDashboardLockStatus(projectId);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('dashboard lock check timeout')), 5000)
        );
        lockStatus = await Promise.race([lockPromise, timeoutPromise]);
      } catch (lockErr) {
        console.warn('[세션완료] 대시보드 잠금 확인 실패/타임아웃, 건너뜀:', lockErr.message);
      }

      // 2. Export 존재 여부 확인
      const urlResult = await exportService.getExportDownloadUrl(projectId, sessionId).catch(() => ({ hasExport: false }));
      const hasExport = urlResult.hasExport;

      if (lockStatus.dashboardExists) {
        if (lockStatus.isLocked) {
          // Case 2-1: 대시보드 작업 중인 사용자가 있음 → 차단
          setCompleteDialog({
            open: true,
            type: 'blocked',
            editorUserName: lockStatus.editorUserName || '알 수 없는 사용자',
            hasExport,
          });
          return;
        } else {
          // Case 2-2: 대시보드 존재하지만 작업 중인 사용자 없음 → 초기화 확인
          setCompleteDialog({
            open: true,
            type: 'confirm_reset',
            editorUserName: null,
            hasExport,
          });
          return;
        }
      }

      // 대시보드가 없는 경우 → 일반 세션 완료 확인
      console.log('[세션완료] 다이얼로그 오픈: confirm_normal');
      setCompleteDialog({
        open: true,
        type: 'confirm_normal',
        editorUserName: null,
        hasExport,
      });
    } catch (e) {
      console.error('[세션완료] handleCompleteSession 에러:', e);
      // 에러 시에도 일반 세션 완료 플로우로 fallback
      setCompleteDialog({
        open: true,
        type: 'confirm_normal',
        editorUserName: null,
        hasExport: false,
      });
    }
  };

  // ★ 세션 완료 프로그레스 상태
  const [completeProgress, setCompleteProgress] = useState(0);
  const [completeMessage, setCompleteMessage] = useState('');
  const [completeOverlay, setCompleteOverlay] = useState(false);

  const pollCompleteProgress = async (taskId) => {
    const POLL_INTERVAL = 1500;
    const MAX_POLLS = 400; // 최대 10분
    const MAX_NOT_FOUND_RETRIES = 5; // NOT_FOUND 허용 재시도 횟수
    let notFoundCount = 0;

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      try {
        const p = await exportService.getCompleteProgress(projectId, sessionId, taskId);
        setCompleteProgress(p.progress || 0);
        setCompleteMessage(p.message || '처리 중...');

        if (p.status === 'COMPLETED') {
          return p.result || {};
        }
        if (p.status === 'FAILED') {
          throw new Error(p.message || '세션 완료 실패');
        }
        if (p.status === 'NOT_FOUND') {
          notFoundCount++;
          console.warn(`[pollCompleteProgress] NOT_FOUND (${notFoundCount}/${MAX_NOT_FOUND_RETRIES}), taskId=${taskId}`);
          if (notFoundCount >= MAX_NOT_FOUND_RETRIES) {
            throw new Error('작업을 찾을 수 없습니다.');
          }
          // NOT_FOUND도 재시도 (서버 일시적 상태 불일치 대응)
          continue;
        }
        // 정상 응답이면 NOT_FOUND 카운터 리셋
        notFoundCount = 0;
      } catch (e) {
        if (e.message && !e.message.includes('Network')) throw e;
        // 네트워크 오류는 재시도
      }
    }
    throw new Error('시간 초과: 세션 완료 처리 시간이 초과되었습니다.');
  };

  const handleConfirmComplete = async (resetDashboard = false) => {
    const forceExport = !completeDialog.hasExport;
    console.log('[세션완료] handleConfirmComplete 시작 (fire_and_forget)', {
      resetDashboard, forceExport, projectId, sessionId
    });

    setCompleteDialog(prev => ({ ...prev, open: false }));
    setExporting(true);

    try {
      // 대시보드 초기화가 필요한 경우
      if (resetDashboard) {
        console.log('[세션완료] resetDashboard 시작');
        await costReductionService.resetDashboard(projectId);
        console.log('[세션완료] resetDashboard 완료');
      }

      // ★ fire_and_forget 모드: 즉시 반환, 모든 작업은 백그라운드
      console.log('[세션완료] completeSession POST 전송 (fire_and_forget 모드)');
      const startResult = await exportService.completeSession(
        projectId, sessionId, forceExport, 'fire_and_forget'
      );
      console.log('[세션완료] completeSession 응답 (즉시 반환):', startResult);

      // 즉시 업로드 페이지로 이동 — 진행률은 업로드 페이지에서 확인
      alert('완료 처리가 시작되었습니다. 업로드 페이지에서 진행 상황을 확인할 수 있습니다.');
      navigate(`/projects/${projectId}/upload`);
    } catch (e) {
      console.error('[세션완료] 에러 상세:', {
        message: e.message,
        status: e.response?.status,
        data: e.response?.data,
      });
      alert('세션 완료 실패: ' + (e.response?.data?.message || e.message));
    } finally {
      setExporting(false);
    }
  };

  // ===== 세부 클러스터링 페이지 이동 =====
  const handleDetailClustering = () => {
    if (!selectedCluster) {
      alert('먼저 클러스터를 선택해주세요.');
      return;
    }
    // Detail Clustering 페이지로 이동 (cluster_id 전달)
    navigate(`/projects/${projectId}/sessions/${sessionId}/detailclustering?clusterId=${selectedCluster.number}`);
  };

  // ===== 숫자 포맷팅 =====
  const formatNumber = (value) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') return value.toLocaleString('ko-KR');
    return value;
  };

  const formatAmount = (value) => {
    if (value === null || value === undefined) return '-';
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return value;
    if (Math.abs(num) >= 1e8) return (num / 1e8).toFixed(1) + '억';
    if (Math.abs(num) >= 1e4) return (num / 1e4).toFixed(0) + '만';
    return num.toLocaleString('ko-KR');
  };

  // ===== 전체 데이터 컬럼 정의 =====
  const allDataTableColumns = useMemo(() => {
    return allDataColumns.map(colName => ({
      key: colName,
      label: colName,
      sortable: true,
      width: colName === '클러스터명' || colName === '세부클러스터명' ? 120 : 100,
      sticky: colName === '클러스터명' || colName === '세부클러스터명',
      render: (row) => <span className="text-xs">{formatNumber(row[colName])}</span>
    }));
  }, [allDataColumns]);

  // ===== 클러스터별 세부 항목 컬럼 정의 =====
  const detailTableColumns = useMemo(() => {
    return detailColumns.map(colName => ({
      key: colName,
      label: colName,
      sortable: true,
      width: colName === '클러스터명' || colName === '세부클러스터명' ? 120 : 100,
      sticky: colName === '클러스터명' || colName === '세부클러스터명',
      render: (row) => <span className="text-xs">{formatNumber(row[colName])}</span>
    }));
  }, [detailColumns]);

  // ===== 프론트 정렬 =====
  const sortDataLocal = useCallback((data, sort) => {
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
      return sort.direction === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return sorted;
  }, []);

  const sortedAllData = useMemo(() => sortDataLocal(allData, allDataSort), [allData, allDataSort, sortDataLocal]);
  const sortedDetailData = useMemo(() => sortDataLocal(detailData, detailSort), [detailData, detailSort, sortDataLocal]);

  // ===== 선택된 클러스터 수 =====
  const selectedClusterCount = clusterCheckedSet.size;
  const parentClusterCount = clusterData.filter(c => c.isParentRow).length;

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">

        {!isEditor && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 flex items-center gap-2">
                <Lock className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">
                    {editorInfo?.editorUserName || '다른 사용자'}님이 편집 중입니다 (세션 완료는 가능합니다)
                </span>
            </div>
        )}

        {/* 상단 헤더 */}
        <div className="flex-shrink-0 space-y-3 mb-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/projects"><Home className="h-4 w-4" /></BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
              <BreadcrumbItem><BreadcrumbLink href={`/projects/${projectId}/upload`}>프로젝트</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
              <BreadcrumbItem><BreadcrumbPage className="font-semibold">Step 6: Export</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {isViewer && (
            <div className="mx-4 mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium">
              뷰어 권한: 조회만 가능합니다. 데이터 수정이 불가합니다.
            </div>
          )}
        </div>

        {/* 메인 콘텐츠 그리드 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측 (8/12) - 테이블 영역 */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-3">

            {/* 전체 데이터 탭 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-2 px-4 border-b bg-white flex-shrink-0 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold">
                  전체 데이터 ({allDataTotalCount.toLocaleString()}건)
                </CardTitle>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => loadAllData(0, allDataPageSize)} disabled={loading}>
                  <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />새로고침
                </Button>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0">
                  <AdvancedTable
                    columns={allDataTableColumns}
                    data={sortedAllData}
                    rowKey={(r, i) => r._rawDataId || i}
                    sort={allDataSort}
                    onSortChange={(field, direction) => setAllDataSort({ field, direction })}
                    emptyMessage="데이터가 없습니다."
                    maxHeight="100%"
                  />
                </div>
                {/* 페이징 */}
                {allDataTotalPages > 1 && (
                  <div className="p-2 border-t bg-white flex-shrink-0 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {(allDataPage * allDataPageSize + 1).toLocaleString()} - {Math.min((allDataPage + 1) * allDataPageSize, allDataTotalCount).toLocaleString()} / {allDataTotalCount.toLocaleString()}건
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => loadAllData(0, allDataPageSize)} disabled={allDataPage === 0}>처음</Button>
                      <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => loadAllData(allDataPage - 1, allDataPageSize)} disabled={allDataPage === 0}>이전</Button>
                      <span className="px-2">{allDataPage + 1} / {allDataTotalPages}</span>
                      <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => loadAllData(allDataPage + 1, allDataPageSize)} disabled={allDataPage >= allDataTotalPages - 1}>다음</Button>
                      <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => loadAllData(allDataTotalPages - 1, allDataPageSize)} disabled={allDataPage >= allDataTotalPages - 1}>마지막</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 클러스터별 세부 항목 탭 */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm overflow-hidden">
              <CardHeader className="py-2 px-4 border-b bg-white flex-shrink-0 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold">
                  클러스터별 세부 항목 ({detailTotalCount.toLocaleString()}건)
                  {selectedCluster && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {selectedCluster.name} (#{selectedCluster.number})
                    </Badge>
                  )}
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={handleDetailClustering}
                  disabled={!selectedCluster}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />세부 클러스터링 수행
                </Button>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0">
                  {detailData.length > 0 ? (
                    <AdvancedTable
                      columns={detailTableColumns}
                      data={sortedDetailData}
                      rowKey={(r, i) => i}
                      sort={detailSort}
                      onSortChange={(field, direction) => setDetailSort({ field, direction })}
                      emptyMessage="클러스터를 선택해주세요."
                      maxHeight="100%"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      {selectedCluster ? '데이터가 없습니다.' : '우측 Clustering 결과에서 "자세히" 버튼을 클릭하세요.'}
                    </div>
                  )}
                </div>
                {/* 페이징 */}
                {detailTotalPages > 1 && (
                  <div className="p-2 border-t bg-white flex-shrink-0 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {(detailPage * detailPageSize + 1).toLocaleString()} - {Math.min((detailPage + 1) * detailPageSize, detailTotalCount).toLocaleString()} / {detailTotalCount.toLocaleString()}건
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => loadClusterDetail(selectedCluster.number, 0, detailPageSize)} disabled={detailPage === 0}>처음</Button>
                      <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => loadClusterDetail(selectedCluster.number, detailPage - 1, detailPageSize)} disabled={detailPage === 0}>이전</Button>
                      <span className="px-2">{detailPage + 1} / {detailTotalPages}</span>
                      <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => loadClusterDetail(selectedCluster.number, detailPage + 1, detailPageSize)} disabled={detailPage >= detailTotalPages - 1}>다음</Button>
                      <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => loadClusterDetail(selectedCluster.number, detailTotalPages - 1, detailPageSize)} disabled={detailPage >= detailTotalPages - 1}>마지막</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 우측 (4/12) */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">

            {/* Clustering 결과 탭 (50%+) */}
            <Card className="flex-shrink-0 shadow-sm" style={{ height: '55%', minHeight: '300px' }}>
              <CardHeader className="py-2 px-4 border-b flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  Clustering 결과
                  <Badge variant="secondary" className="text-xs">{parentClusterCount}개</Badge>
                  {selectedClusterCount > 0 && (
                    <Badge variant="default" className="text-xs">{selectedClusterCount} 선택</Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Checkbox
                    checked={selectedClusterCount === parentClusterCount && parentClusterCount > 0}
                    onCheckedChange={handleSelectAllClusters}
                    disabled={isViewer}
                  />
                  <span className="text-xs text-muted-foreground">전체선택</span>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-auto" style={{ height: 'calc(100% - 45px)' }}>
                <div className="text-[10px] text-pink-600 px-3 py-1 bg-pink-50">
                  * 클러스터명/세부클러스터명 클릭하여 수정 가능 | 드래그로 복수 선택
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold w-8"></th>
                      <th className="px-2 py-1.5 text-left font-semibold">클러스터명</th>
                      <th className="px-2 py-1.5 text-left font-semibold">세부클러스터명</th>
                      <th className="px-2 py-1.5 text-left font-semibold">키워드</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Count</th>
                      <th className="px-2 py-1.5 text-right font-semibold">합산</th>
                      <th className="px-2 py-1.5 text-center font-semibold w-12">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusterData.map((cluster, idx) => {
                      const isChecked = clusterCheckedSet.has(cluster.clusterNumber);
                      const isEditing = editingCluster === cluster.clusterNumber;
                      const isParent = cluster.isParentRow;
                      const isSub = cluster.isSubCluster;
                      const isUndef = cluster.isUndefined;

                      return (
                        <tr
                          key={`${cluster.clusterNumber}-${idx}`}
                          className={`border-b cursor-pointer transition-colors ${
                            isChecked ? 'bg-blue-100' : 'hover:bg-gray-50'
                          } ${isSub || isUndef ? 'bg-gray-50' : ''}`}
                          onMouseDown={(e) => isParent && handleRowMouseDown(e, cluster.clusterNumber)}
                          onMouseEnter={() => isParent && handleRowMouseEnter(cluster.clusterNumber)}
                        >
                          {/* 체크박스 - mouseDown 이벤트 전파 차단 */}
                          <td className="px-2 py-1.5" onMouseDown={(e) => e.stopPropagation()}>
                            {isParent && (
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => handleClusterCheck(cluster.clusterNumber)}
                                disabled={isViewer}
                              />
                            )}
                          </td>
                          {isEditing ? (
                            /* 편집 모드: 클러스터명 입력이 나머지 공간을 모두 사용 */
                            <td className="px-2 py-1.5" colSpan={6} onMouseDown={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <Input
                                  className="h-6 text-xs flex-1"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveClusterName(cluster.clusterNumber);
                                    if (e.key === 'Escape') handleCancelEdit();
                                  }}
                                  autoFocus
                                  disabled={isViewer}
                                />
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0 flex-shrink-0" onClick={() => handleSaveClusterName(cluster.clusterNumber)} disabled={isViewer}>
                                  <Save className="h-3 w-3 text-green-600" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0 flex-shrink-0" onClick={handleCancelEdit} disabled={isViewer}>
                                  <X className="h-3 w-3 text-red-600" />
                                </Button>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="px-2 py-1.5" onMouseDown={(e) => e.stopPropagation()}>
                                <span
                                  className={`${!isViewer ? 'cursor-pointer hover:underline' : ''} ${isParent ? 'font-medium' : 'pl-3 text-gray-600'}`}
                                  onClick={() => !isViewer && isParent && handleEditClusterName(cluster)}
                                >
                                  {isParent ? cluster.clusterName : ''}
                                </span>
                              </td>
                              <td className="px-2 py-1.5" onMouseDown={(e) => e.stopPropagation()}>
                                {editingSubCluster === cluster.clusterNumber && isSub ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      className="h-6 text-xs flex-1 min-w-[60px]"
                                      value={editingSubName}
                                      onChange={(e) => setEditingSubName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveSubClusterName(cluster.clusterNumber);
                                        if (e.key === 'Escape') handleCancelSubEdit();
                                      }}
                                      autoFocus
                                      disabled={isViewer}
                                    />
                                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 flex-shrink-0" onClick={() => handleSaveSubClusterName(cluster.clusterNumber)} disabled={isViewer}>
                                      <Save className="h-3 w-3 text-green-600" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 flex-shrink-0" onClick={handleCancelSubEdit} disabled={isViewer}>
                                      <X className="h-3 w-3 text-red-600" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span
                                    className={`${isSub && !isViewer ? 'text-blue-600 cursor-pointer hover:underline' : isSub && isViewer ? 'text-blue-600' : isUndef ? 'text-orange-600' : ''}`}
                                    onClick={() => !isViewer && isSub && handleEditSubClusterName(cluster)}
                                  >
                                    {cluster.subClusterName}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 max-w-[100px] truncate" title={(cluster.keywords || []).join(', ')}>
                                {(cluster.keywords || []).slice(0, 3).join(', ')}
                                {(cluster.keywords || []).length > 3 && '...'}
                              </td>
                              <td className="px-2 py-1.5 text-right">{formatNumber(cluster.count)}</td>
                              <td className="px-2 py-1.5 text-right">{formatAmount(cluster.totalAmount)}</td>
                              <td className="px-2 py-1.5 text-center">
                                {isParent && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      loadClusterDetail(cluster.clusterNumber);
                                    }}
                                  >
                                    <Eye className="h-3 w-3 mr-1" />자세히
                                  </Button>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {clusterData.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">클러스터 데이터가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* 제거열 설정 탭 */}
            <Card className="flex-1 mt-3 shadow-sm flex flex-col min-h-0">
              <CardHeader className="py-2 px-4 border-b flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold">제거열 설정</CardTitle>
                <div className="flex items-center gap-1">
                  <Checkbox
                    checked={columnSettings.length > 0 && columnCheckedSet.size === columnSettings.length}
                    onCheckedChange={(checked) => {
                      const newSet = checked
                        ? new Set(columnSettings.map(c => c.originalName))
                        : new Set();
                      handleColumnCheckedChange(newSet);
                    }}
                    disabled={isViewer}
                  />
                  <span className="text-xs text-muted-foreground">전체선택</span>
                </div>
              </CardHeader>
              <CardContent className="p-2 flex-1 overflow-auto min-h-0">
                <p className="text-[10px] text-pink-600 mb-2">* 체크 해제한 열은 Export에서 제외됩니다. 드래그 또는 Ctrl+클릭으로 여러 항목을 선택한 후 한번에 체크/해제할 수 있습니다.</p>
                <MultiSelectCheckList
                  items={columnSettings}
                  checkedSet={columnCheckedSet}
                  onCheckedChange={handleColumnCheckedChange}
                  getKey={(item) => item.originalName}
                  disabled={isViewer}
                  renderLabel={(item, isChecked) => (
                    <>
                      <span className={`text-xs flex-1 ${!isChecked ? 'text-gray-400 line-through' : ''}`}>
                        {item.displayName || item.originalName}
                      </span>
                      <Badge variant="outline" className="text-[9px]">{item.dataType || 'text'}</Badge>
                    </>
                  )}
                />
                {columnSettings.length === 0 && (
                  <p className="text-xs text-gray-400 p-2">컬럼 정보가 없습니다.</p>
                )}
              </CardContent>
            </Card>

            {/* Export 버튼 영역 */}
            <div className="flex-shrink-0 pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-10 relative overflow-hidden"
                  onClick={handleExportSelected}
                  disabled={exporting || selectedClusterCount === 0 || isViewer}
                >
                  {exportingType === 'selected' && exportProgress > 0 && (
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-blue-100 transition-all duration-300"
                      style={{ width: `${exportProgress}%` }}
                    />
                  )}
                  <span className="relative z-10 flex items-center">
                    {exportingType === 'selected' ? (
                      <><RefreshCw className="h-4 w-4 mr-1 animate-spin" />{exportProgress}%</>
                    ) : (
                      <><Download className="h-4 w-4 mr-1" />개별 Export ({selectedClusterCount})</>
                    )}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className="h-10 relative overflow-hidden"
                  onClick={handleExportAll}
                  disabled={exporting || isViewer}
                >
                  {exportingType === 'all' && exportProgress > 0 && (
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-blue-100 transition-all duration-300"
                      style={{ width: `${exportProgress}%` }}
                    />
                  )}
                  <span className="relative z-10 flex items-center">
                    {exportingType === 'all' ? (
                      <><RefreshCw className="h-4 w-4 mr-1 animate-spin" />{exportProgress}%</>
                    ) : (
                      <><Download className="h-4 w-4 mr-1" />전체 Export</>
                    )}
                  </span>
                </Button>
              </div>
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold"
                onClick={handleCompleteSession}
                disabled={exporting || isViewer}
              >
                {exporting ? (
                  <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <CheckSquare className="h-5 w-5 mr-2" />
                )}
                세션 완료
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ★ 세션 완료 프로그레스 오버레이 */}
      {completeOverlay && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-8 w-[480px] flex flex-col items-center gap-5">
            <Loader2 className="h-10 w-10 animate-spin text-green-500" />
            <div className="text-lg font-semibold text-gray-800">세션 완료 처리 중</div>
            <div className="w-full">
              <Progress value={completeProgress} className="h-4" />
            </div>
            <div className="flex items-center justify-between w-full text-sm">
              <span className="text-muted-foreground">{completeMessage}</span>
              <span className="font-mono font-bold text-green-600">{completeProgress}%</span>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Excel 생성 및 통계 처리가 완료될 때까지 페이지를 닫지 마세요.
            </p>
          </div>
        </div>
      )}

      {/* 세션 완료 다이얼로그 */}
      <Dialog open={completeDialog.open} onOpenChange={(open) => !open && setCompleteDialog(prev => ({ ...prev, open: false }))}>
        <DialogContent className="sm:max-w-md">
          {completeDialog.type === 'blocked' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  세션 변경 불가
                </DialogTitle>
                <DialogDescription className="text-sm pt-2">
                  <strong>{completeDialog.editorUserName}</strong> 사용자가 비용 절감 대시보드에서 작업 중이므로 해당 세션을 변경할 수 없습니다.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCompleteDialog(prev => ({ ...prev, open: false }))}>
                  확인
                </Button>
              </DialogFooter>
            </>
          )}

          {completeDialog.type === 'confirm_reset' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="h-5 w-5" />
                  대시보드 초기화 경고
                </DialogTitle>
                <DialogDescription className="text-sm pt-2 leading-relaxed">
                  해당 세션 내용을 수정 시 기존 작업 중이던 <strong>비용 절감 대시보드 이력이 모두 초기화</strong>됩니다.
                  <br /><br />
                  <span className="text-red-600 font-medium">
                    Long List, Short List, Able 과제, 관련 첨부파일이 모두 삭제됩니다.
                  </span>
                  <br /><br />
                  세션 완료 작업을 수행하시겠습니까?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setCompleteDialog(prev => ({ ...prev, open: false }))}>
                  취소
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => handleConfirmComplete(true)}
                >
                  확인 (초기화 후 세션 완료)
                </Button>
              </DialogFooter>
            </>
          )}

          {completeDialog.type === 'confirm_normal' && (
            <>
              <DialogHeader>
                <DialogTitle>세션 완료</DialogTitle>
                <DialogDescription className="text-sm pt-2">
                  {completeDialog.hasExport
                    ? '세션을 종료하시겠습니까?'
                    : '클러스터링 결과를 Excel File로 저장하고 세션을 종료하시겠습니까?'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setCompleteDialog(prev => ({ ...prev, open: false }))}>
                  취소
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleConfirmComplete(false)}
                >
                  확인
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ExportPage;
