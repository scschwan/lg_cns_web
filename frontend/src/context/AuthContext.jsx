/**
 * AuthContext - 전역 인증 상태 관리 Context
 *
 * AuthProvider가 제공하는 상태 및 함수:
 * - user: 현재 로그인한 사용자 정보 ({ userId, email, name, role })
 * - login(credentials): 로그인 수행
 * - register(userData): 회원가입 수행
 * - logout(): 로그아웃 (토큰 제거 + user null)
 * - updateUser(fields): user 객체 부분 업데이트 (프로필 수정 등)
 * - isAuthenticated: 인증 여부 (boolean)
 * - loading: 초기 세션 검증 중 여부
 * - validateSession(): 서버에 세션 유효성을 검증
 *
 * 자동 기능:
 * - 초기 마운트 시 /api/auth/me 호출로 세션 검증
 * - 15분마다 주기적 세션 검증 (유휴 시 자동 로그아웃)
 * - 사용자 활동 추적 (click, keydown, mousemove, scroll, touchstart)
 * - 15분 이상 미활동 시 토큰 삭제 및 로그아웃
 * - 탭 복귀/창 포커스/네트워크 복구 시 유휴 시간 확인 후 세션 검증
 * - api.js 인터셉터의 session-expired 이벤트 수신 시 React state 동기화
 * - 클라이언트 측 JWT exp 클레임으로 토큰 만료 즉시 감지
 */
import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import authService from '../services/authService';
import api from '../services/api';
import { isAuthTokenExpired, isRefreshTokenExpired } from '../utils/tokenUtils';
import { isUserIdle, IDLE_TIMEOUT_MS, LAST_ACTIVITY_KEY } from '../utils/idleUtils';

const AuthContext = createContext();

/** 활동 이벤트 쓰로틀: 1분에 한 번만 lastActivityTime 갱신 */
const ACTIVITY_THROTTLE_MS = 60 * 1000;

/** AuthContext 소비 훅. AuthProvider 내부에서만 사용 가능 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastValidatedRef = useRef(0); // 마지막 성공적 검증 타임스탬프
  const lastActivityUpdateRef = useRef(0); // 활동 이벤트 쓰로틀용

  // ── 마지막 활동 시각 갱신 (쓰로틀 적용: 1분에 1회) ──
  const updateLastActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityUpdateRef.current < ACTIVITY_THROTTLE_MS) return;
    lastActivityUpdateRef.current = now;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  }, []);

  // ── 즉시 로그아웃 (서버 요청 없이 클라이언트만 정리) ──
  const forceLogout = useCallback(() => {
    authService.logout();
    setUser(null);
    setLoading(false);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    sessionStorage.setItem('sessionExpired', 'true');
    window.location.href = '/login';
  }, []);

  // ── 클라이언트 측 토큰 만료 즉시 체크 ──
  // 서버 요청 없이 JWT exp 클레임으로 판단
  const checkTokenLocally = useCallback(() => {
    const authToken = localStorage.getItem('authToken');
    if (!authToken || authToken === 'undefined' || authToken === 'null') {
      return 'no_token';
    }

    // Access token이 유효하면 OK
    if (!isAuthTokenExpired()) {
      return 'valid';
    }

    // Access token 만료 + Refresh token도 만료 → 즉시 로그아웃
    if (isRefreshTokenExpired()) {
      return 'all_expired';
    }

    // Access token만 만료, refresh는 유효 → 서버에서 갱신 가능
    return 'access_expired';
  }, []);

  // ── 세션 유효성 검증 (서버 확인) ──
  const validateSession = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    const currentUser = authService.getCurrentUser();

    // 토큰이나 유저 정보가 없으면 즉시 비인증 처리
    if (!token || token === 'undefined' || token === 'null' || !currentUser) {
      setUser(null);
      setLoading(false);
      return false;
    }

    // ★ 유휴 시간 초과 확인: 15분 이상 미활동이면 로그아웃
    if (isUserIdle()) {
      console.warn('[Auth] 15분 이상 미활동 → 로그아웃');
      forceLogout();
      return false;
    }

    // ★ 클라이언트 측 토큰 만료 먼저 확인
    const tokenStatus = checkTokenLocally();
    if (tokenStatus === 'no_token' || tokenStatus === 'all_expired') {
      console.warn('[Auth] 토큰 만료 감지 (클라이언트) → 로그아웃');
      forceLogout();
      return false;
    }

    try {
      const response = await api.get('/api/auth/me');
      const serverUser = response.data;
      setUser(serverUser);
      setLoading(false);
      lastValidatedRef.current = Date.now();
      return true;
    } catch (error) {
      console.error('세션 검증 실패:', error);

      const status = error.response?.status;

      // 401, 403: 세션 만료 → 즉시 로그인 페이지로 하드 리다이렉트
      if (status === 401 || status === 403) {
        console.warn('[Auth] 세션 검증 401/403 → 즉시 로그아웃');
        forceLogout();
        return false;
      }

      // ★ 네트워크/서버 에러인 경우에도 토큰이 만료되었으면 로그아웃
      if (isAuthTokenExpired()) {
        console.warn('[Auth] 서버 에러 + access token 만료 → 로그아웃');
        forceLogout();
        return false;
      }

      // 서버 에러(500 등)이고 토큰이 아직 유효하면 기존 정보로 유지
      setUser(currentUser);
      setLoading(false);
      return false;
    }
  }, [checkTokenLocally, forceLogout]);

  // ── 초기 세션 검증 (마운트 시 유휴 시간 즉시 체크) ──
  useEffect(() => {
    // 앱 마운트 시 즉시 유휴 시간 확인
    const token = localStorage.getItem('authToken');
    if (token && token !== 'undefined' && token !== 'null') {
      if (isUserIdle()) {
        console.warn('[Auth] 앱 마운트 시 15분 이상 미활동 감지 → 로그아웃');
        forceLogout();
        return;
      }
    }
    validateSession();
  }, [validateSession, forceLogout]);

  // ── 주기적 세션 검증 (15분마다) ──
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      // 유휴 시간 초과 시 로그아웃, 활동 중이면 세션 검증
      if (isUserIdle()) {
        console.warn('[Auth] 주기적 검사: 15분 이상 미활동 → 로그아웃');
        forceLogout();
      } else {
        validateSession();
      }
    }, IDLE_TIMEOUT_MS);

    return () => clearInterval(interval);
  }, [user, validateSession, forceLogout]);

  // ── 사용자 활동 추적 (click, keydown, mousemove, scroll, touchstart) ──
  useEffect(() => {
    if (!user) return;

    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, updateLastActivity, { passive: true });
    });

    // 로그인 직후 초기 활동 시각 설정
    updateLastActivity();

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateLastActivity);
      });
    };
  }, [user, updateLastActivity]);

  // ── ★ 글로벌 세션 만료 이벤트 리스닝 (api.js interceptor에서 발생) ──
  useEffect(() => {
    const handleExpired = () => {
      console.warn('[Auth] session-expired 이벤트 수신 → React state 정리');
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('session-expired', handleExpired);
    return () => window.removeEventListener('session-expired', handleExpired);
  }, []);

  // ── ★ 탭 복귀 / 창 포커스 시 유휴 시간 확인 + 세션 검증 ──
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // ★ 탭 복귀 시 유휴 시간 초과 확인
        if (isUserIdle()) {
          console.warn('[Auth] 탭 복귀 시 15분 이상 미활동 감지 → 즉시 로그아웃');
          forceLogout();
          return;
        }

        // ★ 클라이언트 측에서 토큰 만료를 즉시 체크
        const tokenStatus = checkTokenLocally();
        if (tokenStatus === 'no_token' || tokenStatus === 'all_expired') {
          console.warn('[Auth] 탭 복귀 시 토큰 만료 감지 → 즉시 로그아웃');
          forceLogout();
          return;
        }

        // 마지막 검증 이후 15분 이상 지났으면 서버 검증
        const elapsed = Date.now() - lastValidatedRef.current;
        if (elapsed > IDLE_TIMEOUT_MS) {
          validateSession();
        }
      }
    };

    const handleWindowFocus = () => {
      // ★ 창 포커스 시 유휴 시간 초과 확인
      if (isUserIdle()) {
        console.warn('[Auth] 창 포커스 시 15분 이상 미활동 감지 → 즉시 로그아웃');
        forceLogout();
        return;
      }

      const tokenStatus = checkTokenLocally();
      if (tokenStatus === 'no_token' || tokenStatus === 'all_expired') {
        console.warn('[Auth] 창 포커스 시 토큰 만료 감지 → 즉시 로그아웃');
        forceLogout();
        return;
      }

      const elapsed = Date.now() - lastValidatedRef.current;
      if (elapsed > IDLE_TIMEOUT_MS) {
        validateSession();
      }
    };

    // ★ 네트워크 복구 시 세션 검증
    const handleOnline = () => {
      if (isUserIdle()) {
        console.warn('[Auth] 네트워크 복구 시 15분 이상 미활동 감지 → 로그아웃');
        forceLogout();
        return;
      }
      console.info('[Auth] 네트워크 복구 → 세션 검증');
      validateSession();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [user, validateSession, checkTokenLocally, forceLogout]);

  const login = async (credentials) => {
    const data = await authService.login(credentials);

    const loggedInUser = {
      userId: data.userId,
      email: data.email,
      name: data.name,
      role: data.role,
    };

    setUser(loggedInUser);
    lastValidatedRef.current = Date.now();
    // 로그인 시 활동 시각 초기화
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    return data;
  };

  const register = async (userData) => {
    const data = await authService.register(userData);
    return data;
  };

  const logout = () => {
    authService.logout();
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setUser(null);
  };

  const updateUser = (updatedFields) => {
    setUser(prev => prev ? { ...prev, ...updatedFields } : prev);
  };

  const value = {
    user,
    login,
    register,
    logout,
    updateUser,
    isAuthenticated: !!user,
    loading,
    validateSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
