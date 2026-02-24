import { useState, useEffect, useCallback } from 'react';
import costReductionService from '../services/costReductionService';

// 모듈 레벨: 같은 프로젝트 키에 대한 지연 release 타이머 관리
const pendingReleaseTimers = new Map();

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
    if (!projectId) return;

    const lockKey = `editor:${projectId}`;

    // ★ 이전 페이지의 지연 release가 있으면 취소 (같은 프로젝트 내 페이지 전환)
    if (pendingReleaseTimers.has(lockKey)) {
      clearTimeout(pendingReleaseTimers.get(lockKey));
      pendingReleaseTimers.delete(lockKey);
    }

    acquire();

    // 30초마다 하트비트
    const interval = setInterval(() => {
      if (projectId) {
        costReductionService.heartbeat(projectId).catch(() => {});
      }
    }, 30000);

    // 브라우저 탭 닫기 / 외부 이동 시 즉시 잠금 해제
    const releaseImmediate = () => {
      if (projectId) {
        costReductionService.releaseLock(projectId).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', releaseImmediate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', releaseImmediate);

      // ★ React 내부 페이지 전환: 500ms 지연 후 release
      const timer = setTimeout(() => {
        releaseImmediate();
        pendingReleaseTimers.delete(lockKey);
      }, 500);
      pendingReleaseTimers.set(lockKey, timer);
    };
  }, [projectId, acquire]);

  return { isEditor, editorInfo, loading };
}
