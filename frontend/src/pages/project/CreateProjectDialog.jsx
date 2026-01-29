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
import { Loader2, FolderPlus, AlertCircle } from 'lucide-react';

const CreateProjectDialog = ({ open, onClose, onSuccess }) => {
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!projectName.trim()) {
      setError('프로젝트 이름을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 부모 컴포넌트로 데이터 전달
      await onSuccess({
        projectName: projectName.trim(),
        description: description.trim()
      });

      // 성공 시 초기화
      setProjectName('');
      setDescription('');
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
      setError('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5" />
            새 프로젝트 생성
          </DialogTitle>
          <DialogDescription>
            새로운 프로젝트를 생성하여 파일 업로드 및 분석 작업을 시작하세요.
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
              <Label htmlFor="projectName">
                프로젝트 이름 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="projectName"
                placeholder="예: 2025년 1분기 재무분석"
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
                placeholder="프로젝트에 대한 간단한 설명을 입력하세요..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                rows={4}
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