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
