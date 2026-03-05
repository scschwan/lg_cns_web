import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import authService from '../services/authService';
import api from '../services/api';
import { isAuthTokenExpired, isRefreshTokenExpired } from '../utils/tokenUtils';

const AuthContext = createContext();

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

  // ── 즉시 로그아웃 (서버 요청 없이 클라이언트만 정리) ──
  const forceLogout = useCallback(() => {
    authService.logout();
    setUser(null);
    setLoading(false);
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

  // ── 초기 세션 검증 ──
  useEffect(() => {
    validateSession();
  }, [validateSession]);

  // ── 주기적 세션 검증 (1분마다) ──
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      validateSession();
    }, 1 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user, validateSession]);

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

  // ── ★ 탭 복귀 / 창 포커스 시 즉시 세션 검증 ──
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastValidatedRef.current;

        // ★ 클라이언트 측에서 토큰 만료를 즉시 체크
        const tokenStatus = checkTokenLocally();
        if (tokenStatus === 'no_token' || tokenStatus === 'all_expired') {
          console.warn('[Auth] 탭 복귀 시 토큰 만료 감지 → 즉시 로그아웃');
          forceLogout();
          return;
        }

        // 마지막 검증 이후 1분 이상 지났으면 서버 검증
        if (elapsed > 60 * 1000) {
          validateSession();
        }
      }
    };

    const handleWindowFocus = () => {
      const tokenStatus = checkTokenLocally();
      if (tokenStatus === 'no_token' || tokenStatus === 'all_expired') {
        console.warn('[Auth] 창 포커스 시 토큰 만료 감지 → 즉시 로그아웃');
        forceLogout();
        return;
      }

      const elapsed = Date.now() - lastValidatedRef.current;
      if (elapsed > 60 * 1000) {
        validateSession();
      }
    };

    // ★ 네트워크 복구 시 세션 검증
    const handleOnline = () => {
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
    return data;
  };

  const register = async (userData) => {
    const data = await authService.register(userData);
    return data;
  };

  const logout = () => {
    authService.logout();
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
