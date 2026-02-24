import { useState, useEffect } from 'react';
import projectService from '../services/projectService';

/**
 * 뷰어 권한 확인 hook
 * 프로젝트의 myRole을 가져와 VIEWER 여부를 반환한다.
 *
 * @param {string} projectId
 * @returns {{ isViewer: boolean }}
 */
export default function useViewerMode(projectId) {
    const [isViewer, setIsViewer] = useState(false);

    useEffect(() => {
        if (!projectId) return;
        let cancelled = false;
        projectService.getProject(projectId)
            .then(data => {
                if (!cancelled) {
                    const role = data?.myRole || 'VIEWER';
                    setIsViewer(role === 'VIEWER');
                }
            })
            .catch(() => {
                // 프로젝트 조회 실패 시 안전하게 뷰어 처리
                if (!cancelled) setIsViewer(false);
            });
        return () => { cancelled = true; };
    }, [projectId]);

    return { isViewer };
}
