/**
 * DB 상태 모니터링 Context
 *
 * 백엔드 /api/health/db 엔드포인트를 주기적으로 폴링하여
 * DocumentDB의 상태를 모니터링합니다.
 *
 * DB가 OVERLOADED 상태이면 전역 차단 오버레이를 표시하여
 * 사용자의 추가 요청을 막습니다.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

const DbHealthContext = createContext({
    dbStatus: 'OK',        // 'OK' | 'SLOW' | 'OVERLOADED'
    pingMs: 0,
    message: '',
    isOverloaded: false,
});

export function useDbHealth() {
    return useContext(DbHealthContext);
}

// 폴링 간격 (ms)
const POLL_INTERVAL_NORMAL = 15000;     // 정상: 15초
const POLL_INTERVAL_SLOW = 5000;        // 느림: 5초
const POLL_INTERVAL_OVERLOADED = 8000;  // 과부하: 8초

// 연속 타임아웃 시 OVERLOADED 판정 임계치
const TIMEOUT_THRESHOLD = 3;

export function DbHealthProvider({ children }) {
    const [dbStatus, setDbStatus] = useState('OK');
    const [pingMs, setPingMs] = useState(0);
    const [message, setMessage] = useState('');
    const [isOverloaded, setIsOverloaded] = useState(false);

    const consecutiveFailuresRef = useRef(0);
    const timerRef = useRef(null);

    const checkDbHealth = useCallback(async () => {
        try {
            const response = await axios.get(`${API_URL}/api/health/db`, {
                timeout: 10000, // 10초 타임아웃
            });

            const data = response.data;
            setDbStatus(data.dbStatus || 'OK');
            setPingMs(data.pingMs || 0);
            setMessage(data.message || '');

            if (data.dbStatus === 'OVERLOADED') {
                consecutiveFailuresRef.current++;
                if (consecutiveFailuresRef.current >= 2) {
                    setIsOverloaded(true);
                }
            } else {
                consecutiveFailuresRef.current = 0;
                setIsOverloaded(false);
            }
        } catch (error) {
            // 503 (유지보수 모드) 응답은 DB 과부하가 아님 - 무시
            if (error.response?.status === 503) {
                return;
            }

            // 네트워크 에러 또는 타임아웃 → DB 과부하 가능성
            consecutiveFailuresRef.current++;

            if (consecutiveFailuresRef.current >= TIMEOUT_THRESHOLD) {
                setDbStatus('OVERLOADED');
                setPingMs(-1);
                setMessage('서버와 통신할 수 없습니다. DB 과부하일 수 있습니다.');
                setIsOverloaded(true);
            }
        }
    }, []);

    useEffect(() => {
        // 초기 체크 (3초 후 - 앱 로딩 완료 대기)
        const initialTimer = setTimeout(() => {
            checkDbHealth();
        }, 3000);

        return () => clearTimeout(initialTimer);
    }, [checkDbHealth]);

    useEffect(() => {
        // 상태에 따라 폴링 간격 조정
        let interval;
        if (isOverloaded) {
            interval = POLL_INTERVAL_OVERLOADED;
        } else if (dbStatus === 'SLOW') {
            interval = POLL_INTERVAL_SLOW;
        } else {
            interval = POLL_INTERVAL_NORMAL;
        }

        timerRef.current = setInterval(checkDbHealth, interval);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [dbStatus, isOverloaded, checkDbHealth]);

    const value = {
        dbStatus,
        pingMs,
        message,
        isOverloaded,
    };

    return (
        <DbHealthContext.Provider value={value}>
            {children}
        </DbHealthContext.Provider>
    );
}

export default DbHealthContext;
