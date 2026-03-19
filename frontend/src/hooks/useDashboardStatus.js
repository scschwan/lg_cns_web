/**
 * useDashboardStatus - 비용 절감 대시보드 상태 조회 훅
 *
 * 컴포넌트 마운트 시 대시보드 상태(단계, 잠금 등)를 조회한다.
 *
 * @param {string} projectId - 프로젝트 ID
 * @returns {{
 *   dashboardStatus: object|null,  // 대시보드 상태 객체 (phase, locked 등)
 *   loading: boolean,              // 로딩 중 여부
 *   refetch: function              // 상태 수동 새로고침 함수
 * }}
 */
import { useState, useEffect, useCallback } from 'react';
import costReductionService from '../services/costReductionService';

export function useDashboardStatus(projectId) {
  const [dashboardStatus, setDashboardStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await costReductionService.getStatus(projectId);
      setDashboardStatus(res);
    } catch (err) {
      console.error('Failed to fetch dashboard status:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { dashboardStatus, loading, refetch: fetchStatus };
}
