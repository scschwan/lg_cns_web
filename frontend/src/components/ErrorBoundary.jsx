/**
 * ErrorBoundary - React 에러 경계 컴포넌트
 *
 * 하위 컴포넌트 트리에서 발생하는 렌더링 에러를 포착하여
 * 앱 전체 크래시를 방지하고, 사용자에게 오류 안내 UI를 제공한다.
 *
 * 기능:
 * - getDerivedStateFromError로 에러 상태 캡처
 * - componentDidCatch로 에러 로깅
 * - 새로고침 / 프로젝트 목록(로그인 페이지) 이동 버튼 제공
 *
 * @usage <ErrorBoundary>{children}</ErrorBoundary>
 */
import React from 'react';
import { ServerCrash, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        // 세션 상태를 알 수 없으므로 로그인 페이지로 이동 (full reload)
        window.location.href = '/login';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
                    <div className="text-center max-w-md">
                        <div className="flex justify-center mb-6">
                            <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
                                <ServerCrash className="h-10 w-10 text-red-400" />
                            </div>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-700 mb-2">예기치 않은 오류가 발생했습니다</h2>
                        <p className="text-gray-500 mb-2">
                            화면 렌더링 중 문제가 발생했습니다. 새로고침하거나 프로젝트 목록으로 이동해주세요.
                        </p>
                        {this.state.error?.message && (
                            <p className="text-sm text-red-500 bg-red-50 rounded px-3 py-2 mb-6 break-words">
                                {this.state.error.message}
                            </p>
                        )}
                        {!this.state.error?.message && <div className="mb-8" />}
                        <div className="flex gap-3 justify-center">
                            <Button variant="outline" onClick={this.handleReload}>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                새로고침
                            </Button>
                            <Button onClick={this.handleGoHome}>
                                <Home className="h-4 w-4 mr-2" />
                                프로젝트 목록
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
