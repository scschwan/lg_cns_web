import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CostReductionSidebar from './CostReductionSidebar';
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
        <CostReductionSidebar projectId={projectId} />
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
};

export default CostReductionLayout;
