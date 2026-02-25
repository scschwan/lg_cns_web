// frontend/src/components/common/MaintenanceDialog.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import systemService from '../../services/systemService';

/**
 * 전역 서비스 차단 다이얼로그
 *
 * - 유지보수 모드(isMaintenance) 또는 Lambda 실행 중(isLambdaRunning)일 때 표시
 * - 5초마다 상태 폴링
 * - Lambda 진행률 프로그레스바 표시
 */
export default function MaintenanceDialog() {
    const location = useLocation();
    const [status, setStatus] = useState(null);
    const pollingRef = useRef(null);

    const fetchStatus = useCallback(async () => {
        try {
            const data = await systemService.getMaintenanceStatus();
            setStatus(data);
        } catch (e) {
            // 상태 조회 실패 시 무시 (서버 다운 등)
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        pollingRef.current = setInterval(fetchStatus, 5000);
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [fetchStatus]);

    // 관리자 페이지에서는 차단 다이얼로그를 표시하지 않음 (차단 해제를 위해)
    const isAdminPage = location.pathname.startsWith('/admin');
    if (isAdminPage) return null;

    // 서비스 이용 불가 상태가 아니면 렌더링하지 않음
    if (!status) return null;
    const isBlocked = status.isMaintenance || status.isLambdaRunning;
    if (!isBlocked) return null;

    const progress = status.lambdaProgress ?? 0;
    const isLambda = !!status.isLambdaRunning;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <div
                style={{
                    backgroundColor: '#fff',
                    borderRadius: '12px',
                    padding: '40px 48px',
                    maxWidth: '480px',
                    width: '90%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    textAlign: 'center',
                }}
            >
                {/* 아이콘 */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                    {isLambda ? (
                        <Loader2
                            style={{
                                width: '48px',
                                height: '48px',
                                color: '#3b82f6',
                                animation: 'spin 1s linear infinite',
                            }}
                        />
                    ) : (
                        <AlertTriangle
                            style={{ width: '48px', height: '48px', color: '#f59e0b' }}
                        />
                    )}
                </div>

                {/* 제목 */}
                <h2
                    style={{
                        fontSize: '20px',
                        fontWeight: '700',
                        color: '#111827',
                        marginBottom: '12px',
                    }}
                >
                    서비스 이용 불가
                </h2>

                {/* 메시지 */}
                <p
                    style={{
                        fontSize: '15px',
                        color: '#6b7280',
                        lineHeight: '1.6',
                        marginBottom: '24px',
                    }}
                >
                    {isLambda
                        ? '현재 파일 업로드/데이터베이스 생성 중이라 서비스 이용이 불가합니다. 잠시만 대기해주세요.'
                        : (status.reason || '현재 시스템 점검 중입니다. 잠시만 대기해주세요.')}
                </p>

                {/* Lambda 진행률 바 */}
                {isLambda && (
                    <div style={{ marginBottom: '12px' }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '12px',
                                color: '#6b7280',
                                marginBottom: '6px',
                            }}
                        >
                            <span>처리 중...</span>
                            <span>{progress}%</span>
                        </div>
                        <div
                            style={{
                                width: '100%',
                                height: '8px',
                                backgroundColor: '#e5e7eb',
                                borderRadius: '4px',
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    width: `${progress}%`,
                                    height: '100%',
                                    backgroundColor: '#3b82f6',
                                    borderRadius: '4px',
                                    transition: 'width 0.5s ease',
                                }}
                            />
                        </div>
                    </div>
                )}

                <p style={{ fontSize: '12px', color: '#9ca3af' }}>
                    작업이 완료되면 자동으로 서비스가 재개됩니다.
                </p>
            </div>

            {/* CSS 스핀 애니메이션 */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
