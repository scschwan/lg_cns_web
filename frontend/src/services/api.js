import axios from 'axios';
import { isTokenExpired, isRefreshTokenExpired } from '../utils/tokenUtils';

const API_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 토큰 갱신 중복 방지 플래그
let isRefreshing = false;
let failedQueue = [];

// ★ 연속 서버 에러/타임아웃 감지 (DB 과부하 보조 탐지)
let consecutiveServerErrors = 0;
const SERVER_ERROR_THRESHOLD = 5; // 연속 5회 서버 에러 시 경고

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// 세션 만료 처리 (localStorage 정리 + 로그인 페이지 이동)
const handleSessionExpired = () => {
  // 이미 로그인 페이지에 있으면 중복 리다이렉트 방지
  if (window.location.pathname === '/login') return;

  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  sessionStorage.setItem('sessionExpired', 'true');

  // AuthContext 등 리스너에게 즉시 알림 (React state 동기화)
  window.dispatchEvent(new Event('session-expired'));

  window.location.href = '/login';
};

// 요청 인터셉터 (JWT 토큰 자동 추가 + ★ 만료 토큰 사전 차단)
api.interceptors.request.use(
  (config) => {
    // 인증이 필요없는 요청은 통과
    const isAuthRequest = config.url?.includes('/api/auth/login') ||
                          config.url?.includes('/api/auth/register') ||
                          config.url?.includes('/api/auth/refresh');
    if (isAuthRequest) return config;

    const token = localStorage.getItem('authToken');

    // ★ 토큰이 없으면 즉시 세션 만료 처리
    if (!token || token === 'undefined' || token === 'null') {
      handleSessionExpired();
      return Promise.reject(new axios.Cancel('세션이 만료되었습니다.'));
    }

    // ★ Access token이 만료된 경우 사전 체크
    if (isTokenExpired(token)) {
      const refreshToken = localStorage.getItem('refreshToken');

      // Refresh token도 만료 → 서버에 요청할 필요 없이 즉시 로그아웃
      if (!refreshToken || refreshToken === 'undefined' || refreshToken === 'null' || isRefreshTokenExpired()) {
        handleSessionExpired();
        return Promise.reject(new axios.Cancel('세션이 만료되었습니다.'));
      }
    }

    config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터 (401 시 refreshToken으로 재시도 → 실패 시 로그인 이동)
api.interceptors.response.use(
  (response) => {
    // ★ 정상 응답 시 연속 에러 카운터 리셋
    consecutiveServerErrors = 0;

    // ★ CloudFront 프록시 타임아웃 감지: JSON 요청인데 HTML 응답이 온 경우
    const contentType = response.headers?.['content-type'] || '';
    if (contentType.includes('text/html') && !response.config?.expectHtml) {
      console.error('[api] CloudFront HTML 응답 감지 (프록시 타임아웃 가능성):', response.config?.url);
      return Promise.reject(new Error('서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'));
    }

    return response;
  },
  async (error) => {
    // Cancel된 요청 (사전 차단된 만료 토큰)은 그대로 reject
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config;

    // 401 에러 처리
    if (error.response?.status === 401) {
      // 로그인/리프레시 요청 자체가 401이면 바로 로그아웃
      if (originalRequest.url?.includes('/api/auth/login') ||
          originalRequest.url?.includes('/api/auth/refresh')) {
        handleSessionExpired();
        return Promise.reject(error);
      }

      // refresh 후 재시도에서도 401 → 세션 완전 만료
      if (originalRequest._retry) {
        handleSessionExpired();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // 이미 갱신 중이면 큐에 대기
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken || refreshToken === 'undefined' || refreshToken === 'null') {
        isRefreshing = false;
        handleSessionExpired();
        return Promise.reject(error);
      }

      // ★ Refresh token도 만료되었으면 서버에 요청하지 않고 즉시 로그아웃
      if (isRefreshTokenExpired()) {
        isRefreshing = false;
        processQueue(error, null);
        handleSessionExpired();
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_URL}/api/auth/refresh`, {
          refreshToken: refreshToken,
        });

        const newAccessToken = response.data.accessToken;
        localStorage.setItem('authToken', newAccessToken);

        if (response.data.refreshToken) {
          localStorage.setItem('refreshToken', response.data.refreshToken);
        }

        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        handleSessionExpired();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // 403 Forbidden도 세션 만료로 처리
    if (error.response?.status === 403) {
      handleSessionExpired();
    }

    // ★ 서버 에러(500+) 또는 타임아웃 감지 → DB 과부하 보조 경고
    const status = error.response?.status;
    if (status >= 500 || error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK') {
      consecutiveServerErrors++;
      if (consecutiveServerErrors >= SERVER_ERROR_THRESHOLD) {
        console.warn(`[api] 연속 서버 에러 ${consecutiveServerErrors}회 감지 - DB 과부하 가능성`);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
