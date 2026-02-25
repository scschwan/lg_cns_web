// frontend/src/components/common/ViewerModeOverlay.jsx

import React, { useCallback } from 'react';
import { Eye } from 'lucide-react';
import useViewerMode from '../../hooks/useViewerMode';

/**
 * 뷰어 모드 사용자의 모든 인터랙션을 차단하는 래퍼 컴포넌트.
 *
 * 전략:
 * - 캡처 단계에서 click, keyboard, form 이벤트를 차단 → 버튼/입력/체크박스 등 모든 조작 불가
 * - mouseDown/touchStart는 차단하지 않음 → 스크롤바 드래그, 모바일 스크롤 유지
 * - wheel 이벤트 차단하지 않음 → 마우스 휠 스크롤 유지
 * - 사이드바(메뉴 이동)는 이 컴포넌트 바깥이므로 영향 없음
 * - 편집자/관리자에게는 children을 그대로 렌더링
 */
const ViewerModeOverlay = ({ projectId, children }) => {
  const { isViewer } = useViewerMode(projectId);

  // 클릭·키보드·폼 이벤트 차단 (스크롤 관련 이벤트는 차단하지 않음)
  const blockEvent = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
  }, []);

  // focus 즉시 해제 → 키보드 탐색 차단
  const blockFocus = useCallback((e) => {
    if (e.target !== e.currentTarget) {
      e.target.blur();
    }
  }, []);

  if (!isViewer) {
    return <>{children}</>;
  }

  return (
    <div className="relative flex-1 overflow-hidden flex flex-col">
      {/* 뷰어 모드 안내 배너 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm flex-shrink-0 z-10">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span className="font-medium">뷰어 모드</span>
        <span className="text-amber-600">— 읽기 전용으로 접속 중입니다. 편집 권한이 필요하면 프로젝트 관리자에게 문의하세요.</span>
      </div>

      {/* 콘텐츠 영역 — 캡처 단계에서 인터랙션 차단 (스크롤은 허용) */}
      <div
        className="flex-1 overflow-hidden viewer-mode-content"
        style={{ userSelect: 'none' }}
        onClickCapture={blockEvent}
        onDoubleClickCapture={blockEvent}
        onKeyDownCapture={blockEvent}
        onKeyUpCapture={blockEvent}
        onChangeCapture={blockEvent}
        onInputCapture={blockEvent}
        onSubmitCapture={blockEvent}
        onDragStartCapture={blockEvent}
        onDropCapture={blockEvent}
        onContextMenuCapture={blockEvent}
        onFocusCapture={blockFocus}
      >
        {/* interactive 요소 시각적 비활성화 (cursor + opacity) */}
        <style>{`
          .viewer-mode-content button,
          .viewer-mode-content input,
          .viewer-mode-content select,
          .viewer-mode-content textarea,
          .viewer-mode-content [role="checkbox"],
          .viewer-mode-content [role="button"],
          .viewer-mode-content [role="combobox"],
          .viewer-mode-content [role="switch"],
          .viewer-mode-content [role="slider"],
          .viewer-mode-content [role="tab"],
          .viewer-mode-content [role="option"],
          .viewer-mode-content [role="radio"],
          .viewer-mode-content a[href] {
            cursor: default !important;
            opacity: 0.5 !important;
          }
        `}</style>
        {children}
      </div>
    </div>
  );
};

export default ViewerModeOverlay;
