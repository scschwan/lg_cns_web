import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';

/**
 * 세션 만료 시 로그인 페이지 리다이렉트 전 잠시 표시되는 토스트.
 * api.js의 handleSessionExpired에서 sessionStorage에 플래그를 심고,
 * LoginPage에서 이 컴포넌트를 렌더하여 사용자에게 알림을 보여준다.
 */
function SessionExpiredToast() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const expired = sessionStorage.getItem('sessionExpired');
        if (expired === 'true') {
            setShow(true);
            sessionStorage.removeItem('sessionExpired');
            const timer = setTimeout(() => setShow(false), 5000);
            return () => clearTimeout(timer);
        }
    }, []);

    if (!show) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 shadow-lg">
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">로그인 세션이 만료되었습니다. 다시 로그인해주세요.</span>
            </div>
        </div>
    );
}

export default SessionExpiredToast;
