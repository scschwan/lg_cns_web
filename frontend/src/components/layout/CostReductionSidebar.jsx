/**
 * CostReductionSidebar - 비용 절감 대시보드 사이드바 네비게이션
 *
 * 5단계 비용 절감 프로세스(Long List → Short List → Able 과제 등록 →
 * Able 과제 관리 → 완료 과제 관리)의 메뉴를 제공한다.
 * 현재 활성 단계를 하이라이트로 표시하며, 각 단계 클릭 시 해당 경로로 이동한다.
 *
 * @param {string} projectId - 현재 프로젝트 ID (URL 경로 생성에 사용)
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  ListChecks, ClipboardList, FilePlus, FolderKanban, CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/** 비용 절감 프로세스 5단계 정의 */
const steps = [
  {
    id: 1,
    name: 'Long List 도출',
    description: '비용 유형별 분류 분석',
    pathSuffix: '/longlist',
    icon: ListChecks,
  },
  {
    id: 2,
    name: 'Short List 도출',
    description: '세부 항목 선택 및 분석',
    pathSuffix: '/shortlist',
    icon: ClipboardList,
  },
  {
    id: 3,
    name: 'Able 과제 등록',
    description: '과제 등록 및 자료 관리',
    pathSuffix: '/able-register',
    icon: FilePlus,
  },
  {
    id: 4,
    name: 'Able 과제 관리',
    description: '등록 과제 현황 관리',
    pathSuffix: '/able-manage',
    icon: FolderKanban,
  },
  {
    id: 5,
    name: '완료 과제 관리',
    description: '완료된 과제 관리',
    pathSuffix: '/completed-manage',
    icon: CheckCircle2,
  },
];

const CostReductionSidebar = ({ projectId }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const getPath = (pathSuffix) => `/projects/${projectId}${pathSuffix}`;
  const isActive = (pathSuffix) => location.pathname === getPath(pathSuffix);

  return (
    <div className="w-64 h-full bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
              CR
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">비용 절감</p>
            <p className="text-xs text-muted-foreground">Cost Reduction</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {steps.map((step) => {
            const Icon = step.icon;
            const active = isActive(step.pathSuffix);

            return (
              <button
                key={step.id}
                onClick={() => navigate(getPath(step.pathSuffix))}
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all',
                  'hover:bg-accent hover:text-accent-foreground',
                  active && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                  !active && 'text-muted-foreground'
                )}
              >
                <div className="flex flex-col items-center gap-1 mt-0.5">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                    active && 'bg-primary-foreground text-primary',
                    !active && 'bg-muted'
                  )}>
                    {step.id}
                  </div>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium text-sm', active && 'text-primary-foreground')}>
                    {step.name}
                  </p>
                  <p className={cn(
                    'text-xs mt-0.5',
                    active ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  )}>
                    {step.description}
                  </p>
                </div>
                {active && <ChevronRight className="w-4 h-4 mt-2 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-muted/30 flex-shrink-0">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>비용 절감 대시보드 v1.0</p>
        </div>
      </div>
    </div>
  );
};

export default CostReductionSidebar;
