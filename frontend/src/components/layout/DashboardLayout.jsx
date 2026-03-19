// frontend/src/components/layout/DashboardLayout.jsx
/**
 * DashboardLayout - 데이터 처리 7단계 프로세스의 공통 레이아웃
 *
 * 좌측 사이드바(Sidebar)와 우측 메인 콘텐츠 영역으로 구성된다.
 * 뷰어 모드 사용자는 ViewerModeOverlay에 의해 콘텐츠 편집이 차단된다.
 *
 * @param {React.ReactNode} children - 메인 콘텐츠 페이지 컴포넌트
 */
import React from 'react';
import { useParams } from 'react-router-dom';
import Sidebar from './Sidebar';
import ViewerModeOverlay from '../common/ViewerModeOverlay';

const DashboardLayout = ({ children }) => {
  const { projectId } = useParams();

  return (
    <div className="flex h-full overflow-hidden bg-background font-pretendard">
      {/* Sidebar — 뷰어도 메뉴 이동 가능 */}
      <Sidebar />

      {/* Main Content — 뷰어 모드 시 모든 인터랙션 차단 */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <ViewerModeOverlay projectId={projectId}>
          {children}
        </ViewerModeOverlay>
      </main>
    </div>
  );
};

export default DashboardLayout;