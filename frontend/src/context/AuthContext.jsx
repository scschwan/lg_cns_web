import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import api from '../services/api';

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

  // 세션 유효성 검증
   const validateSession = async () => {
      const token = localStorage.getItem('authToken');
      const currentUser = authService.getCurrentUser();

      // 토큰이나 유저 정보가 없으면 즉시 비인증 처리
      if (!token || token === 'undefined' || token === 'null' || !currentUser) {
        setUser(null);
        setLoading(false);
        return false;
      }

      try {
        const response = await api.get('/api/auth/me');
        const serverUser = response.data;
        setUser(serverUser);
        setLoading(false);
        return true;
      } catch (error) {
        console.error('세션 검증 실패:', error);

        // 401, 403: 세션 만료 → 로그아웃
        // 500, 네트워크 에러: 서버 문제 → localStorage 데이터로 우선 유지
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          authService.logout();
          setUser(null);
        } else {
          // 서버 에러(500 등)인 경우 localStorage의 기존 정보로 유지
          setUser(currentUser);
        }

        setLoading(false);
        return false;
      }
    };

  useEffect(() => {
    validateSession();
  }, []);

  // 주기적 세션 검증 (5분마다)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      validateSession();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user]);

  const login = async (credentials) => {
    const data = await authService.login(credentials);

    const user = {
      userId: data.userId,
      email: data.email,
      name: data.name,
      role: data.role,
    };

    setUser(user);
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
