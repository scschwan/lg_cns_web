/**
 * DB 과부하 차단 오버레이
 *
 * DocumentDB CPU가 과부하 상태일 때 전체 화면을 덮는 오버레이를 표시하여
 * 사용자의 추가 요청을 차단합니다.
 */
import React from 'react';
import { useDbHealth } from '../../context/DbHealthContext';
import { Loader2, AlertTriangle } from 'lucide-react';

function DbOverloadOverlay() {
    const { isOverloaded, message, pingMs } = useDbHealth();

    if (!isOverloaded) return null;

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-[520px] flex flex-col items-center gap-5">
                <div className="flex items-center gap-3">
                    <AlertTriangle className="h-10 w-10 text-amber-500" />
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>

                <div className="text-lg font-semibold text-gray-800">
                    DB 서버 과부하 감지
                </div>

                <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                        현재 DB 서버의 과도한 사용으로 서비스 이용에 차질이 생기고 있습니다.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        잠시만 기다려 주세요. 서버 상태가 정상화되면 자동으로 복구됩니다.
                    </p>
                </div>

                {message && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 w-full">
                        <p className="text-xs text-amber-700 text-center">{message}</p>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs text-muted-foreground">
                        서버 상태를 모니터링 중입니다...
                        {pingMs > 0 && ` (응답: ${pingMs}ms)`}
                    </span>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                    이 화면이 장시간 지속되면 관리자에게 문의해 주세요.
                </p>
            </div>
        </div>
    );
}

export default DbOverloadOverlay;
