/**
 * CostReductionLayout - 비용 절감 대시보드 레이아웃 컴포넌트
 *
 * 상단 헤더(프로젝트 목록 이동 버튼 + 제목),
 * 좌측 사이드바(CostReductionSidebar), 우측 메인 콘텐츠 영역으로 구성된다.
 * 뷰어 모드 사용자는 ViewerModeOverlay에 의해 콘텐츠 영역의 편집이 차단된다.
 *
 * @param {React.ReactNode} children - 메인 콘텐츠 영역에 렌더링할 페이지 컴포넌트
 */
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CostReductionSidebar from './CostReductionSidebar';
import ViewerModeOverlay from '../common/ViewerModeOverlay';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const CostReductionLayout = ({ children }) => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top Bar */}
      <header className="h-14 border-b bg-card flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
            프로젝트 목록
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-lg font-semibold">비용 절감 대시보드</h1>
        </div>
      </header>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 — 뷰어도 메뉴 이동 가능 */}
        <CostReductionSidebar projectId={projectId} />
        {/* 콘텐츠 — 뷰어 모드 시 모든 인터랙션 차단 */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <ViewerModeOverlay projectId={projectId}>
            {children}
          </ViewerModeOverlay>
        </main>
      </div>
    </div>
  );
};

export default CostReductionLayout;
