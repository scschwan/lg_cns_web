import { useState, useEffect, useCallback } from 'react';
import uploadService from '../services/uploadService';

/**
 * 세션 편집자 잠금 훅
 *
 * - 마운트 시 잠금 획득 시도
 * - 30초마다 하트비트 전송 (Redis TTL 60초)
 * - 언마운트 / 페이지 이탈 시 잠금 해제
 *
 * ★ 같은 (projectId, sessionId)로 페이지 전환 시 release→acquire 경쟁 방지:
 *   언마운트 시 즉시 release하지 않고 500ms 지연 후 release한다.
 *   새 페이지가 같은 키로 마운트되면 지연된 release를 취소하여 잠금 유지.
 *
 * @param {string} projectId
 * @param {string} sessionId
 * @returns {{ isEditor: boolean, editorInfo: object|null, loading: boolean }}
 */

// 모듈 레벨: 같은 세션 키에 대한 지연 release 타이머 관리
const pendingReleaseTimers = new Map();

export function useSessionEditorLock(projectId, sessionId) {
  const [isEditor, setIsEditor] = useState(false);
  const [editorInfo, setEditorInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const acquire = useCallback(async () => {
    if (!projectId || !sessionId) return;
    try {
      const res = await uploadService.acquireSessionLock(projectId, sessionId);
      setIsEditor(res.isEditor);
      setEditorInfo(res);
    } catch (err) {
      console.error('Failed to acquire session lock:', err);
      setIsEditor(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId]);

  useEffect(() => {
    if (!projectId || !sessionId) return;

    const lockKey = `session:${projectId}:${sessionId}`;

    // ★ 이전 페이지의 지연 release가 있으면 취소 (같은 세션 내 페이지 전환)
    if (pendingReleaseTimers.has(lockKey)) {
      clearTimeout(pendingReleaseTimers.get(lockKey));
      pendingReleaseTimers.delete(lockKey);
    }

    acquire();

    // 30초마다 하트비트
    const interval = setInterval(() => {
      if (projectId && sessionId) {
        uploadService.sessionHeartbeat(projectId, sessionId).catch(() => {});
      }
    }, 30000);

    // 브라우저 탭 닫기 / 외부 이동 시 즉시 잠금 해제
    const releaseImmediate = () => {
      if (projectId && sessionId) {
        uploadService.releaseSessionLock(projectId, sessionId).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', releaseImmediate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', releaseImmediate);

      // ★ React 내부 페이지 전환: 즉시 release하지 않고 500ms 지연
      //   새 페이지가 같은 키로 마운트되면 위에서 타이머를 취소하여 잠금 유지
      //   다른 페이지로 이동한 경우(세션 이탈) 500ms 후 release 실행
      const timer = setTimeout(() => {
        releaseImmediate();
        pendingReleaseTimers.delete(lockKey);
      }, 500);
      pendingReleaseTimers.set(lockKey, timer);
    };
  }, [projectId, sessionId, acquire]);

  return { isEditor, editorInfo, loading };
}
