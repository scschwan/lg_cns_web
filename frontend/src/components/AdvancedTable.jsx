// frontend/src/components/AdvancedTable.jsx
//
// 공통 테이블 컴포넌트 - 모든 페이지에서 사용
// 기능: sticky header, 컬럼 리사이즈, 정렬, 드래그앤드롭 컬럼 재배치, 컬럼 고정(pinned)

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * AdvancedTable 컴포넌트
 *
 * @param {Array} columns - 컬럼 정의 배열
 *   { key, label, pinned?, sortable?, resizable?, width?, minWidth?, render?, headerRender?, cellClassName?, headerClassName? }
 *   - key: 데이터 필드명
 *   - label: 헤더 표시명
 *   - pinned: true면 좌측 고정 (DnD 불가)
 *   - sortable: 정렬 가능 여부
 *   - resizable: 리사이즈 가능 (기본 true)
 *   - width: 초기 너비 (px)
 *   - minWidth: 최소 너비 (px, 기본 40)
 *   - render: (row, rowIdx) => ReactNode (커스텀 셀 렌더링)
 *   - cellClassName: 셀 추가 클래스
 *   - headerClassName: 헤더 추가 클래스
 *
 * @param {Array} data - 행 데이터 배열
 * @param {Function} rowKey - (row, idx) => unique key
 * @param {Object} sort - { field, direction } 현재 정렬 상태
 * @param {Function} onSortChange - (field, direction) => void
 * @param {Function} onRowClick - (row, idx) => void
 * @param {Function} rowClassName - (row, idx) => className string
 * @param {string} maxHeight - CSS 최대 높이 (없으면 flex-1)
 * @param {string} className - 래퍼 추가 클래스
 * @param {string} emptyMessage - 데이터 없을 때 메시지
 * @param {boolean} loading - 로딩 상태
 * @param {string} loadingMessage - 로딩 메시지
 */
function AdvancedTable({
  columns: columnsProp,
  data = [],
  rowKey = (row, idx) => row._id || idx,
  sort = null,
  onSortChange = null,
  onRowClick = null,
  rowClassName = null,
  maxHeight,
  className = '',
  emptyMessage = '데이터가 없습니다',
  loading = false,
  loadingMessage = '로딩 중...',
}) {
  // ===== 컬럼 순서 =====
  const [columnOrder, setColumnOrder] = useState(() => columnsProp.map(c => c.key));

  // ===== 컬럼 너비 =====
  const [columnWidths, setColumnWidths] = useState({});

  // columns prop이 변경되면 순서 업데이트 (새 컬럼 추가, 제거된 컬럼 삭제)
  useEffect(() => {
    setColumnOrder(prev => {
      const newKeys = columnsProp.map(c => c.key);
      const newKeySet = new Set(newKeys);
      // 기존 순서 중 유효한 것만 유지
      const kept = prev.filter(k => newKeySet.has(k));
      const keptSet = new Set(kept);
      // 새로 추가된 컬럼 끝에 추가
      const added = newKeys.filter(k => !keptSet.has(k));
      return [...kept, ...added];
    });
  }, [columnsProp]);

  // ===== 정렬된 컬럼 목록 (pinned → unpinned) =====
  const orderedColumns = useMemo(() => {
    const colMap = new Map(columnsProp.map(c => [c.key, c]));
    const pinned = columnOrder.filter(k => colMap.get(k)?.pinned);
    const unpinned = columnOrder.filter(k => {
      const c = colMap.get(k);
      return c && !c.pinned;
    });
    return [...pinned, ...unpinned].map(k => colMap.get(k)).filter(Boolean);
  }, [columnsProp, columnOrder]);

  // ===== 컬럼 리사이즈 =====
  const handleResizeStart = useCallback((e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const th = e.target.closest('th');
    const startX = e.clientX;
    const startWidth = th ? th.getBoundingClientRect().width : (columnWidths[colKey] || 100);
    const minW = columnsProp.find(c => c.key === colKey)?.minWidth || 40;

    const handleMouseMove = (moveE) => {
      const diff = moveE.clientX - startX;
      setColumnWidths(prev => ({
        ...prev,
        [colKey]: Math.max(minW, startWidth + diff),
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnWidths, columnsProp]);

  // ===== 컬럼 DnD 재배치 =====
  const dragColRef = useRef(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const handleDragStart = useCallback((e, colKey) => {
    const col = columnsProp.find(c => c.key === colKey);
    if (col?.pinned) { e.preventDefault(); return; }
    dragColRef.current = colKey;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colKey);
    e.currentTarget.style.opacity = '0.5';
  }, [columnsProp]);

  const handleDragEnd = useCallback((e) => {
    e.currentTarget.style.opacity = '1';
    dragColRef.current = null;
    setDragOverKey(null);
  }, []);

  const handleDragOver = useCallback((e, colKey) => {
    e.preventDefault();
    const col = columnsProp.find(c => c.key === colKey);
    if (col?.pinned) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverKey(colKey);
  }, [columnsProp]);

  const handleDragLeave = useCallback(() => {
    setDragOverKey(null);
  }, []);

  const handleDrop = useCallback((e, targetKey) => {
    e.preventDefault();
    setDragOverKey(null);
    const sourceKey = dragColRef.current;
    if (!sourceKey || sourceKey === targetKey) return;
    const targetCol = columnsProp.find(c => c.key === targetKey);
    if (targetCol?.pinned) return;

    setColumnOrder(prev => {
      const next = [...prev];
      const srcIdx = next.indexOf(sourceKey);
      const tgtIdx = next.indexOf(targetKey);
      if (srcIdx < 0 || tgtIdx < 0) return prev;
      next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, sourceKey);
      return next;
    });
    dragColRef.current = null;
  }, [columnsProp]);

  // ===== 정렬 =====
  const handleSort = useCallback((colKey) => {
    if (!onSortChange) return;
    const col = columnsProp.find(c => c.key === colKey);
    if (!col?.sortable) return;
    if (sort?.field === colKey) {
      onSortChange(colKey, sort.direction === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(colKey, 'desc');
    }
  }, [sort, onSortChange, columnsProp]);

  const renderSortIcon = (colKey) => {
    if (!sort || sort.field !== colKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30 flex-shrink-0" />;
    return sort.direction === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 flex-shrink-0" />
      : <ArrowDown className="h-3 w-3 ml-1 flex-shrink-0" />;
  };

  // ===== 래퍼 스타일 =====
  const wrapperClass = cn(
    'w-full overflow-auto',
    maxHeight ? '' : 'flex-1 min-h-0',
    className,
  );
  const wrapperStyle = maxHeight ? { maxHeight } : {};

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <div className="min-w-max">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr className="border-b">
              {orderedColumns.map((col) => {
                const resizable = col.resizable !== false;
                const draggable = !col.pinned;
                const sortable = col.sortable && !!onSortChange;
                const w = columnWidths[col.key] || col.width;

                return (
                  <th
                    key={col.key}
                    className={cn(
                      'relative px-2 h-10 text-left align-middle font-semibold text-xs whitespace-nowrap bg-gray-100 text-muted-foreground',
                      sortable && 'cursor-pointer select-none',
                      dragOverKey === col.key && 'bg-blue-100',
                      col.headerClassName,
                    )}
                    style={w ? { width: w, minWidth: col.minWidth || 40 } : { minWidth: col.minWidth || 40 }}
                    draggable={draggable}
                    onDragStart={(e) => handleDragStart(e, col.key)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, col.key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, col.key)}
                    onClick={() => sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center">
                      {draggable && (
                        <GripVertical className="h-3 w-3 mr-1 opacity-20 flex-shrink-0 cursor-grab" />
                      )}
                      {col.headerRender ? col.headerRender() : (
                        <span className="truncate">{col.label}</span>
                      )}
                      {sortable && renderSortIcon(col.key)}
                    </div>

                    {/* 리사이즈 핸들 */}
                    {resizable && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-[3px] cursor-col-resize hover:bg-blue-400 transition-colors z-20"
                        onMouseDown={(e) => handleResizeStart(e, col.key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={orderedColumns.length || 1} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
                    <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
                    {loadingMessage}
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length || 1} className="text-center py-8 text-xs text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={rowKey(row, idx)}
                  className={cn(
                    'border-b transition-colors hover:bg-muted/50',
                    onRowClick && 'cursor-pointer',
                    rowClassName && rowClassName(row, idx),
                  )}
                  onClick={() => onRowClick && onRowClick(row, idx)}
                >
                  {orderedColumns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('p-2 align-middle text-xs', col.cellClassName)}
                    >
                      {col.render
                        ? col.render(row, idx)
                        : (
                          <span className="block truncate">
                            {row[col.key] != null ? String(row[col.key]) : ''}
                          </span>
                        )
                      }
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdvancedTable;
