import { useState, useEffect, useCallback } from 'react';
import uploadService from '../services/uploadService';

/**
 * 업로드 페이지 편집자 잠금 훅 (프로젝트 단위)
 *
 * - 마운트 시 잠금 획득 시도
 * - 30초마다 하트비트 전송 (Redis TTL 60초)
 * - 언마운트 / 페이지 이탈 시 잠금 해제
 *
 * 다른 편집자가 이미 사용 중이면 isEditor=false, editorInfo에 현재 편집자 정보 반환
 *
 * @param {string} projectId
 * @returns {{ isEditor: boolean, editorInfo: object|null, loading: boolean }}
 */
export function useUploadPageLock(projectId) {
  const [isEditor, setIsEditor] = useState(false);
  const [editorInfo, setEditorInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const acquire = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await uploadService.acquireUploadPageLock(projectId);
      setIsEditor(res.isEditor);
      setEditorInfo(res);
    } catch (err) {
      console.error('Failed to acquire upload page lock:', err);
      setIsEditor(false);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    acquire();

    // 30초마다 하트비트
    const interval = setInterval(() => {
      if (projectId) {
        uploadService.uploadPageHeartbeat(projectId).catch(() => {});
      }
    }, 30000);

    // 브라우저 탭 닫기 / 외부 이동 시 즉시 잠금 해제
    const releaseImmediate = () => {
      if (projectId) {
        uploadService.releaseUploadPageLock(projectId).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', releaseImmediate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', releaseImmediate);
      // 페이지 이탈 시 즉시 해제
      releaseImmediate();
    };
  }, [projectId, acquire]);

  return { isEditor, editorInfo, loading };
}
