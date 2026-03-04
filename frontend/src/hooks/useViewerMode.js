import { useState, useEffect, useRef } from 'react';
import projectService from '../services/projectService';

/**
 * 뷰어 권한 확인 hook
 * 프로젝트의 myRole을 가져와 VIEWER 여부를 반환한다.
 *
 * ★ 프로젝트 조회 실패 시 최대 2회 재시도 (2초 간격)
 *   재시도 모두 실패해도 isViewer=false 유지 (기존 권한 유지)
 *   → 실제 VIEWER 권한은 백엔드에서도 검증하므로
 *     프론트에서 false-positive 차단으로 조작 불가 상태가 되는 것을 방지
 *
 * @param {string} projectId
 * @returns {{ isViewer: boolean }}
 */
export default function useViewerMode(projectId) {
    const [isViewer, setIsViewer] = useState(false);
    const retryCountRef = useRef(0);

    useEffect(() => {
        if (!projectId) return;
        let cancelled = false;
        retryCountRef.current = 0;

        const fetchRole = () => {
            projectService.getProject(projectId)
                .then(data => {
                    if (!cancelled) {
                        const role = data?.myRole || 'VIEWER';
                        setIsViewer(role === 'VIEWER');
                    }
                })
                .catch((err) => {
                    if (cancelled) return;
                    retryCountRef.current += 1;
                    console.warn(`[useViewerMode] 프로젝트 조회 실패 (${retryCountRef.current}/2):`, err?.message);
                    if (retryCountRef.current < 2) {
                        // 재시도
                        setTimeout(() => { if (!cancelled) fetchRole(); }, 2000);
                    } else {
                        // 모든 재시도 실패 → isViewer=false 유지 (차단하지 않음)
                        // 백엔드에서 실제 권한 검증이 이루어지므로 안전
                        console.warn('[useViewerMode] 프로젝트 조회 최종 실패, isViewer=false 유지');
                    }
                });
        };

        fetchRole();
        return () => { cancelled = true; };
    }, [projectId]);

    return { isViewer };
}
