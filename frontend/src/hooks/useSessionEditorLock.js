import { useState, useEffect, useCallback } from 'react';
import uploadService from '../services/uploadService';

/**
 * 세션 편집자 잠금 훅 (대시보드 useEditorLock과 동일한 패턴)
 *
 * - 마운트 시 잠금 획득 시도
 * - 30초마다 하트비트 전송 (Redis TTL 60초)
 * - 언마운트 / 페이지 이탈 시 잠금 해제
 *
 * @param {string} projectId - 프로젝트 ID
 * @param {string} sessionId - 세션 ID
 * @returns {{ isEditor: boolean, editorInfo: object|null, loading: boolean }}
 */
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
    acquire();

    // 30초마다 하트비트
    const interval = setInterval(() => {
      if (projectId && sessionId) {
        uploadService.sessionHeartbeat(projectId, sessionId).catch(() => {});
      }
    }, 30000);

    // 페이지 이탈 시 잠금 해제
    const release = () => {
      if (projectId && sessionId) {
        uploadService.releaseSessionLock(projectId, sessionId).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', release);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', release);
      release();
    };
  }, [projectId, sessionId, acquire]);

  return { isEditor, editorInfo, loading };
}
