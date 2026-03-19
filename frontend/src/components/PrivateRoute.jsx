/**
 * PrivateRoute - 인증 보호 라우트 컴포넌트
 *
 * 인증되지 않은 사용자를 로그인 페이지로 리다이렉트하고,
 * 관리자 전용 페이지에 대한 접근 제어를 수행한다.
 *
 * @param {React.ReactNode} children - 보호할 자식 컴포넌트
 * @param {boolean} requireAdmin - true이면 ADMIN 역할 필요 (기본: false)
 *
 * 동작 흐름:
 * 1. 세션 확인 중 → 로딩 스피너 표시
 * 2. 미인증 → /login으로 리다이렉트 (원래 경로 state로 전달)
 * 3. 관리자 권한 필요 + 비관리자 → /projects로 리다이렉트
 * 4. 인증 완료 → children 렌더링
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

function PrivateRoute({ children, requireAdmin = false }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 gap-3">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        <p className="text-gray-500 text-sm">세션 확인 중...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user?.role !== 'ADMIN') {
    return <Navigate to="/projects" replace />;
  }

  return children;
}

export default PrivateRoute;
