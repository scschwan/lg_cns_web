/**
 * ProgressDialog - 진행률 표시 다이얼로그 컴포넌트
 *
 * 비동기 작업(파일 업로드, 데이터 처리 등) 진행 중에 모달로 표시된다.
 * 닫기 버튼이 숨겨져 있고, 배경 클릭으로 닫을 수 없다.
 *
 * @param {boolean} open - 다이얼로그 표시 여부
 * @param {string} message - 진행 상태 메시지
 * @param {number} [value] - 진행률 (0~100). 미지정 시 불확정(indeterminate) 상태
 */
import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

function ProgressDialog({ open, message, value }) {
    return (
        <Dialog open={open}>
            {/* 수정 사항:
               1. hideClose 속성 제거
               2. [&>button]:hidden 클래스 추가 (DialogContent 내부의 닫기 버튼 숨김)
               3. onInteractOutside={(e) => e.preventDefault()} (배경 클릭 시 닫힘 방지)
            */}
            <DialogContent
                className="sm:max-w-md [&>button]:hidden"
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        처리 중...
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <Progress
                        value={value !== undefined ? value : undefined}
                        className="h-2"
                    />

                    <p className="text-sm text-center text-muted-foreground">
                        {message}
                    </p>

                    {value !== undefined && (
                        <p className="text-xs text-center text-muted-foreground">
                            {Math.round(value)}%
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default ProgressDialog;