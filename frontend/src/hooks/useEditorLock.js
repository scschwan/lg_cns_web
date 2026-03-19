/**
 * useEditorLock - 비용 절감 대시보드 편집자 잠금 훅
 *
 * Redis 기반 분산 잠금을 사용하여 동시 편집을 방지한다.
 * 마운트 시 잠금 획득, 30초마다 하트비트 전송, 언마운트 시 잠금 해제.
 *
 * 같은 프로젝트 내 페이지 전환 시 release→acquire 경쟁 방지를 위해
 * 언마운트 시 500ms 지연 후 release하고, 새 페이지가 같은 키로 마운트되면
 * 지연된 release를 취소하여 잠금을 유지한다.
 *
 * @param {string} projectId - 프로젝트 ID
 * @returns {{
 *   isEditor: boolean,        // 현재 사용자가 편집자인지 여부
 *   editorInfo: object|null,  // 편집자 정보 (다른 사용자가 편집 중일 때 해당 정보 포함)
 *   loading: boolean          // 잠금 상태 확인 중 여부
 * }}
 */
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
