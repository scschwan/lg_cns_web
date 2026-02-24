import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FolderPlus, AlertCircle, BarChart3, FolderOpen } from 'lucide-react';

const CreateProjectDialog = ({ open, onClose, onSuccess }) => {
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState('STANDARD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isDashboard = projectType === 'DASHBOARD_IMPORT';

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!projectName.trim()) {
      setError('프로젝트 이름을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onSuccess({
        name: projectName.trim(),
        description: description.trim(),
        projectType,
      });

      setProjectName('');
      setDescription('');
      setProjectType('STANDARD');
      onClose();
    } catch (err) {
      console.error('프로젝트 생성 실패:', err);
      setError(err.response?.data?.message || '프로젝트 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setProjectName('');
      setDescription('');
      setProjectType('STANDARD');
      setError('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDashboard ? <BarChart3 className="w-5 h-5 text-emerald-600" /> : <FolderPlus className="w-5 h-5" />}
            새 프로젝트 생성
          </DialogTitle>
          <DialogDescription>
            프로젝트 유형을 선택하고, 이름과 설명을 입력하세요.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>프로젝트 유형</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProjectType('STANDARD')}
                  disabled={loading}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    projectType === 'STANDARD'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FolderOpen className={`h-6 w-6 ${projectType === 'STANDARD' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className={`text-sm font-medium ${projectType === 'STANDARD' ? 'text-blue-700' : 'text-gray-600'}`}>
                    일반 프로젝트
                  </span>
                  <span className="text-[11px] text-muted-foreground text-center leading-tight">
                    7단계 분석 파이프라인
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setProjectType('DASHBOARD_IMPORT')}
                  disabled={loading}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    projectType === 'DASHBOARD_IMPORT'
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <BarChart3 className={`h-6 w-6 ${projectType === 'DASHBOARD_IMPORT' ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <span className={`text-sm font-medium ${projectType === 'DASHBOARD_IMPORT' ? 'text-emerald-700' : 'text-gray-600'}`}>
                    대시보드 업로드
                  </span>
                  <span className="text-[11px] text-muted-foreground text-center leading-tight">
                    클러스터링된 Excel 업로드
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectName">
                프로젝트 이름 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="projectName"
                placeholder={isDashboard ? '예: 2025년 1분기 대시보드' : '예: 2025년 1분기 재무분석'}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                disabled={loading}
                maxLength={100}
              />
              <p className="text-sm text-muted-foreground">
                {projectName.length}/100자
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">프로젝트 설명 (선택)</Label>
              <Textarea
                id="description"
                placeholder={isDashboard ? '대시보드 전용 프로젝트' : '프로젝트에 대한 간단한 설명을 입력하세요...'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                rows={3}
                maxLength={500}
              />
              <p className="text-sm text-muted-foreground">
                {description.length}/500자
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              취소
            </Button>
            <Button type="submit" disabled={loading || !projectName.trim()}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  프로젝트 생성
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateProjectDialog;
