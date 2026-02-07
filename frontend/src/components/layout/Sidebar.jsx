import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import uploadService from '../../services/uploadService';
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
  Lock,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const Sidebar = () => {
  const navigate = useNavigate();
  const { projectId, sessionId } = useParams();
  const location = useLocation();
  const [sessionName, setSessionName] = useState('');
  const [sessionData, setSessionData] = useState(null);

  // Step 1 이동 확인 다이얼로그
  const [showStep1Confirm, setShowStep1Confirm] = useState(false);
  const [pendingStep1Path, setPendingStep1Path] = useState(null);

  useEffect(() => {
    if (projectId && sessionId) {
      uploadService.getSession(projectId, sessionId)
        .then(session => {
          setSessionName(session.sessionName || '');
          setSessionData(session);
        })
        .catch(() => {
          setSessionName('');
          setSessionData(null);
        });
    } else {
      setSessionData(null);
    }
  }, [projectId, sessionId, location.pathname]);

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
      name: 'Start Analysis',
      description: '계정 분석 시작',
      path: sessionId ? `/projects/${projectId}/sessions/${sessionId}/startanalysis` : null,
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

  // Step ID → backend ProcessStep enum name
  const stepIdToEnum = {
    2: 'START_ANALYSIS',
    3: 'PREPROCESSING',
    4: 'TRANSFORM',
    5: 'CLUSTERING',
    6: 'EXPORT',
    7: 'DETAIL_CLUSTERING',
  };

  // 현재 페이지가 Step 2~7인지 판별
  const isOnSessionStep = () => {
    return !!sessionId;
  };

  // 현재 페이지가 Multi File Upload 페이지인지 판별
  const isOnUploadPage = () => {
    return location.pathname.includes('/upload') && !sessionId;
  };

  const isStepActive = (step) => {
    return location.pathname === step.path;
  };

  const isStepCompleted = (step) => {
    if (!sessionData?.stepHistory) return false;
    const stepEnum = stepIdToEnum[step.id];
    if (!stepEnum) return false;
    return sessionData.stepHistory.some(h => h.step === stepEnum && h.status === 'completed');
  };

  const isStepDisabled = (step) => {
    // Step 1은 항상 활성화
    if (step.id === 1) return false;

    // Step 7 (Detail Clustering): sidebar에서 직접 진입 불가
    if (step.id === 7) return true;

    // Multi File Upload 화면에서는 step 2~7 전부 비활성화
    if (isOnUploadPage()) return true;

    // sessionId가 필요한데 없으면 비활성화
    if (step.requiresSession && !sessionId) return true;

    // 세션 데이터 로드 전이면 현재 페이지만 허용
    if (!sessionData) {
      return !isStepActive(step);
    }

    // stepHistory에서 방문한 step 확인
    const stepEnum = stepIdToEnum[step.id];
    if (!stepEnum) return true;

    // stepHistory에 있으면 방문한 적 있음 → 활성화
    const visited = sessionData.stepHistory?.some(h => h.step === stepEnum);
    if (visited) return false;

    // currentStep이면 활성화
    if (sessionData.currentStep === stepEnum) return false;

    // 방문한 적 없고 currentStep도 아니면 비활성화
    return true;
  };

  const handleStepClick = (step) => {
    if (isStepDisabled(step)) return;

    let targetPath = step.path;
    if (!targetPath) return;

    // Step 1 클릭 시 현재 Step 2~7에 있으면 확인 다이얼로그 표시
    if (step.id === 1 && isOnSessionStep()) {
      setPendingStep1Path(targetPath);
      setShowStep1Confirm(true);
      return;
    }

    navigate(targetPath);
  };

  const handleConfirmStep1 = () => {
    setShowStep1Confirm(false);
    if (pendingStep1Path) {
      navigate(pendingStep1Path);
      setPendingStep1Path(null);
    }
  };

  const handleCancelStep1 = () => {
    setShowStep1Confirm(false);
    setPendingStep1Path(null);
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
    <>
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
            const completed = isStepCompleted(step);

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
                    {completed && (
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
                현재 세션: {sessionName || sessionId.slice(0, 8) + '...'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Step 1 이동 확인 다이얼로그 */}
      <Dialog open={showStep1Confirm} onOpenChange={setShowStep1Confirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              페이지 이동 확인
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed pt-2">
              Multi File Upload 단계로 돌아갈 경우 현재 페이지는 작업중이던 세션 항목에서 '계정 분석 시작'으로만 재진입이 가능합니다.
            </DialogDescription>
            <p className="text-sm font-medium pt-2">
              'Multi File Upload' 단계로 이동하시겠습니까?
            </p>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelStep1}>
              취소
            </Button>
            <Button onClick={handleConfirmStep1}>
              이동
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Sidebar;
