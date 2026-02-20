import { useState, useEffect, useCallback } from 'react';
import costReductionService from '../services/costReductionService';

export function useEditorLock(projectId) {
  const [isEditor, setIsEditor] = useState(false);
  const [editorInfo, setEditorInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const acquire = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await costReductionService.acquireLock(projectId);
      setIsEditor(res.isEditor);
      setEditorInfo(res);
    } catch (err) {
      console.error('Failed to acquire editor lock:', err);
      setIsEditor(false);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    acquire();

    // 30초마다 하트비트
    const interval = setInterval(() => {
      if (projectId) {
        costReductionService.heartbeat(projectId).catch(() => {});
      }
    }, 30000);

    // 페이지 이탈 시 잠금 해제
    const release = () => {
      if (projectId) {
        costReductionService.releaseLock(projectId).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', release);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', release);
      release();
    };
  }, [projectId, acquire]);

  return { isEditor, editorInfo, loading };
}
