import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Upload,
  FileText,
  Settings,
  Wand2,
  GitBranch,
  Download,
  Sparkles,
  CheckCircle2,
  Circle,
  Lock
} from 'lucide-react';

const Sidebar = () => {
  const navigate = useNavigate();
  const { projectId, sessionId } = useParams();
  const location = useLocation();

  const steps = [
    {
      id: 1,
      name: 'Multi File Upload',
      description: '파일 업로드 & 세션 생성',
      path: `/projects/${projectId}/upload`,
      icon: Upload,
      requiresSession: false
    },
    {
      id: 2,
      name: 'File Load',
      description: '파일 로드 & 확인',
      path: sessionId ? `/projects/${projectId}/sessions/${sessionId}/fileload` : null,
      icon: FileText,
      requiresSession: true
    },
    {
      id: 3,
      name: 'Preprocessing',
      description: '데이터 전처리',
      path: sessionId ? `/projects/${projectId}/sessions/${sessionId}/preprocessing` : null,
      icon: Settings,
      requiresSession: true
    },
    {
      id: 4,
      name: 'Data Transform',
      description: '데이터 변환',
      path: sessionId ? `/projects/${projectId}/sessions/${sessionId}/transform` : null,
      icon: Wand2,
      requiresSession: true
    },
    {
      id: 5,
      name: 'Clustering',
      description: '클러스터링',
      path: sessionId ? `/projects/${projectId}/sessions/${sessionId}/clustering` : null,
      icon: GitBranch,
      requiresSession: true
    },
    {
      id: 6,
      name: 'Export',
      description: '결과 내보내기',
      path: sessionId ? `/projects/${projectId}/sessions/${sessionId}/export` : null,
      icon: Download,
      requiresSession: true
    },
    {
      id: 7,
      name: 'Detail Clustering',
      description: '상세 클러스터링',
      path: sessionId ? `/projects/${projectId}/sessions/${sessionId}/detailclustering` : null,
      icon: Sparkles,
      requiresSession: true
    }
  ];

  const isStepActive = (step) => {
    return location.pathname === step.path;
  };

  const isStepCompleted = (step) => {
    // TODO: 나중에 실제 완료 상태 체크 로직 추가
    return false;
  };

  const isStepDisabled = (step) => {
      // ⭐ 임시로 모든 Step 활성화 (개발 중)
      return false;

      /* 나중에 다시 활성화할 코드 (주석 처리)
      // Step 1은 항상 활성화
      if (step.id === 1) return false;

      // sessionId가 필요한 Step인데 없으면 비활성화
      if (step.requiresSession && !sessionId) return true;

      // TODO: 나중에 순차 진행 validation 로직 추가
      // 예: Step 2는 Step 1이 완료되어야만 활성화
      return false;
      */
  };

  const handleStepClick = (step) => {
    // ⭐ 개발 중: 모든 제약 무시하고 이동
    let targetPath = step.path;

    // sessionId가 없는 Step 2-7의 경우 임시 sessionId 사용
    if (!targetPath && step.requiresSession) {
      const tempSessionId = sessionId || 'temp-session-dev';
      const stepRoutes = {
        2: 'fileload',
        3: 'preprocessing',
        4: 'transform',
        5: 'clustering',
        6: 'export',
        7: 'detailclustering'
      };
      const routeName = stepRoutes[step.id];
      targetPath = `/projects/${projectId}/sessions/${tempSessionId}/${routeName}`;
    }

    if (targetPath) {
      navigate(targetPath);
    }

    /* 원래 코드 (나중에 복구용 - 주석 처리)
    if (isStepDisabled(step)) {
      return;
    }

    if (step.path) {
      navigate(step.path);
    } else {
      alert('먼저 세션을 생성해주세요. (Step 1)');
    }
    */
  };

  const getStepIcon = (step) => {
    if (isStepCompleted(step)) {
      return CheckCircle2;
    }
    if (isStepDisabled(step)) {
      return Lock;
    }
    return step.icon;
  };

  return (

      <div className="w-64 h-screen bg-card border-r border-border flex flex-col">

          <div className="p-4 border-b border-border flex-shrink-0">
              <h2 className="text-lg font-semibold">Process Steps</h2>
              <p className="text-sm text-muted-foreground mt-1">
              7단계 데이터 처리 과정
            </p>
          </div>

      {/* Steps */}
      <nav className="flex-1 overflow-y-auto p-2 max-h-[calc(100vh-280px)]">
        <div className="space-y-1">
          {steps.map((step, index) => {
            const Icon = getStepIcon(step);
            const isActive = isStepActive(step);
            const isDisabled = isStepDisabled(step);
            const isCompleted = isStepCompleted(step);

            return (
              <button
                key={step.id}
                onClick={() => handleStepClick(step)}
                disabled={isDisabled}
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all',
                  'hover:bg-accent hover:text-accent-foreground',
                  isActive && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                  isDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                  !isActive && !isDisabled && 'text-muted-foreground'
                )}
              >
                {/* Step Number & Icon */}
                <div className="flex flex-col items-center gap-1 mt-0.5">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                    isActive && 'bg-primary-foreground text-primary',
                    !isActive && !isDisabled && 'bg-muted',
                    isDisabled && 'bg-muted/50'
                  )}>
                    {step.id}
                  </div>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Step Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      'font-medium text-sm',
                      isActive && 'text-primary-foreground'
                    )}>
                      {step.name}
                    </p>
                    {isCompleted && (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                    {isDisabled && (
                      <Lock className="w-3 h-3" />
                    )}
                  </div>
                  <p className={cn(
                    'text-xs mt-0.5',
                    isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  )}>
                    {step.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-muted/30 flex-shrink-0">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-2">
              <Circle className="w-3 h-3" />
              세션이 필요한 Step은 Step 1 완료 후 활성화됩니다.
            </p>
            {sessionId && (
              <p className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="w-3 h-3" />
                현재 세션: {sessionId.slice(0, 8)}...
              </p>
            )}
          </div>
        </div>
      </div>
  );
};

export default Sidebar;