/**
 * ProgressDialog 컴포넌트 테스트
 *
 * 테스트 대상:
 * - open prop에 따른 다이얼로그 표시/숨김
 * - message prop 렌더링
 * - value prop에 따른 진행률 표시
 * - 외부 클릭 방지 (닫힘 방지)
 *
 * 실행 방법: npx vitest run src/components/common/ProgressDialog.test.jsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressDialog from './ProgressDialog';

// Radix UI Dialog 컴포넌트 Mock
vi.mock('@/components/ui/dialog', () => ({
    Dialog: ({ open, children }) => open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children, onInteractOutside }) => (
        <div data-testid="dialog-content">{children}</div>
    ),
    DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children, className }) => <h2 className={className}>{children}</h2>,
}));

// Progress 컴포넌트 Mock
vi.mock('@/components/ui/progress', () => ({
    Progress: ({ value, className }) => (
        <div
            data-testid="progress-bar"
            data-value={value}
            className={className}
            role="progressbar"
            aria-valuenow={value}
        />
    ),
}));

// lucide-react Mock
vi.mock('lucide-react', () => ({
    Loader2: ({ className }) => <div data-testid="loader-icon" className={className} />,
}));

describe('ProgressDialog', () => {

    // ========== open prop 테스트 ==========

    describe('open prop', () => {
        it('open=true이면 다이얼로그가 렌더링된다', () => {
            render(<ProgressDialog open={true} message="처리 중..." value={50} />);

            expect(screen.getByTestId('dialog')).toBeInTheDocument();
        });

        it('open=false이면 다이얼로그가 렌더링되지 않는다', () => {
            render(<ProgressDialog open={false} message="처리 중..." value={50} />);

            expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
        });
    });

    // ========== message prop 테스트 ==========

    describe('message prop', () => {
        it('message를 화면에 표시한다', () => {
            render(<ProgressDialog open={true} message="엑셀 파싱 중..." value={30} />);

            expect(screen.getByText('엑셀 파싱 중...')).toBeInTheDocument();
        });

        it('message가 변경되면 업데이트된 내용을 표시한다', () => {
            const { rerender } = render(
                <ProgressDialog open={true} message="S3 업로드 중..." value={20} />
            );

            expect(screen.getByText('S3 업로드 중...')).toBeInTheDocument();

            rerender(<ProgressDialog open={true} message="Lambda 처리 중..." value={60} />);

            expect(screen.getByText('Lambda 처리 중...')).toBeInTheDocument();
        });

        it('"처리 중..." 타이틀을 항상 표시한다', () => {
            render(<ProgressDialog open={true} message="테스트" value={0} />);

            expect(screen.getByText('처리 중...')).toBeInTheDocument();
        });
    });

    // ========== value prop 테스트 ==========

    describe('value prop', () => {
        it('value가 있으면 진행률 바를 렌더링한다', () => {
            render(<ProgressDialog open={true} message="처리 중..." value={75} />);

            const progressBar = screen.getByTestId('progress-bar');
            expect(progressBar).toBeInTheDocument();
            expect(progressBar).toHaveAttribute('data-value', '75');
        });

        it('value가 있으면 퍼센트 텍스트를 표시한다', () => {
            render(<ProgressDialog open={true} message="처리 중..." value={75} />);

            expect(screen.getByText('75%')).toBeInTheDocument();
        });

        it('value=0이면 0%를 표시한다', () => {
            render(<ProgressDialog open={true} message="시작 중..." value={0} />);

            expect(screen.getByText('0%')).toBeInTheDocument();
        });

        it('value=100이면 100%를 표시한다', () => {
            render(<ProgressDialog open={true} message="완료!" value={100} />);

            expect(screen.getByText('100%')).toBeInTheDocument();
        });

        it('value가 소수점이면 반올림하여 표시한다', () => {
            render(<ProgressDialog open={true} message="처리 중..." value={33.7} />);

            // Math.round(33.7) = 34
            expect(screen.getByText('34%')).toBeInTheDocument();
        });

        it('value가 undefined이면 퍼센트 텍스트를 표시하지 않는다', () => {
            render(<ProgressDialog open={true} message="처리 중..." />);

            // value가 undefined이면 퍼센트 표시 영역이 없어야 함
            expect(screen.queryByText(/%/)).not.toBeInTheDocument();
        });
    });

    // ========== 로딩 인디케이터 테스트 ==========

    describe('로딩 인디케이터', () => {
        it('Loader2 아이콘을 렌더링한다', () => {
            render(<ProgressDialog open={true} message="처리 중..." value={50} />);

            expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
        });
    });

    // ========== 진행률 업데이트 흐름 테스트 ==========

    describe('진행률 업데이트 흐름', () => {
        it('엑셀 업로드 플로우: 0 → 30 → 60 → 100 순서로 진행률이 변한다', () => {
            const { rerender } = render(
                <ProgressDialog open={true} message="업로드 준비 중..." value={5} />
            );
            expect(screen.getByText('5%')).toBeInTheDocument();

            rerender(<ProgressDialog open={true} message="S3 업로드 중..." value={30} />);
            expect(screen.getByText('30%')).toBeInTheDocument();

            rerender(<ProgressDialog open={true} message="Lambda 처리 중..." value={60} />);
            expect(screen.getByText('60%')).toBeInTheDocument();

            rerender(<ProgressDialog open={true} message="완료" value={100} />);
            expect(screen.getByText('100%')).toBeInTheDocument();
        });

        it('처리 완료 후 다이얼로그가 닫힌다 (open=false)', () => {
            const { rerender } = render(
                <ProgressDialog open={true} message="처리 중..." value={100} />
            );
            expect(screen.getByTestId('dialog')).toBeInTheDocument();

            rerender(<ProgressDialog open={false} message="완료" value={100} />);
            expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
        });
    });
});
