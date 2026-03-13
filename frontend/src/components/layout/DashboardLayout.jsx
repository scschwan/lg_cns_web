// frontend/src/components/layout/DashboardLayout.jsx

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