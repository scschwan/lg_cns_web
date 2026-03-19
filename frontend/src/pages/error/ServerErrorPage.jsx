/**
 * 500 서버 에러 페이지 컴포넌트
 *
 * 서버 오류 발생 시 표시되는 에러 페이지이다.
 * location.state를 통해 전달된 에러 메시지를 표시하며,
 * 새로고침 및 홈/로그인 이동 버튼을 제공한다.
 *
 * @component
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '@/components/ui/button';
import { ServerCrash, Home, RotateCcw, LogIn } from 'lucide-react';

function ServerErrorPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, loading } = useAuth();
    const errorMessage = location.state?.message;

    /** 홈 이동 핸들러 - 인증 상태에 따라 프로젝트 목록 또는 로그인 페이지로 이동 */
    const handleGoHome = () => {
        if (isAuthenticated) {
            navigate('/projects');
        } else {
            window.location.href = '/login';
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="text-center max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
                        <ServerCrash className="h-10 w-10 text-red-400" />
                    </div>
                </div>
                <h1 className="text-6xl font-bold text-red-200 mb-2">500</h1>
                <h2 className="text-xl font-semibold text-gray-700 mb-2">서버 오류가 발생했습니다</h2>
                <p className="text-gray-500 mb-2">
                    일시적인 서버 문제입니다. 잠시 후 다시 시도해주세요.
                </p>
                {errorMessage && (
                    <p className="text-sm text-red-500 bg-red-50 rounded px-3 py-2 mb-6 break-words">
                        {errorMessage}
                    </p>
                )}
                {!errorMessage && <div className="mb-8" />}
                <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={() => window.location.reload()}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        새로고침
                    </Button>
                    <Button onClick={handleGoHome} disabled={loading}>
                        {isAuthenticated ? (
                            <><Home className="h-4 w-4 mr-2" />프로젝트 목록</>
                        ) : (
                            <><LogIn className="h-4 w-4 mr-2" />로그인</>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default ServerErrorPage;
