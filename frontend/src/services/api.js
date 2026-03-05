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

// ★ 세션 만료 중복 호출 방지 플래그
let isSessionExpiring = false;

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

// ★ 토큰 갱신 함수 (request interceptor와 response interceptor 모두에서 사용)
const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');

  if (!refreshToken || refreshToken === 'undefined' || refreshToken === 'null') {
    throw new Error('No refresh token');
  }

  if (isRefreshTokenExpired()) {
    throw new Error('Refresh token expired');
  }

  const response = await axios.post(`${API_URL}/api/auth/refresh`, {
    refreshToken: refreshToken,
  });

  const newAccessToken = response.data.accessToken;
  localStorage.setItem('authToken', newAccessToken);

  if (response.data.refreshToken) {
    localStorage.setItem('refreshToken', response.data.refreshToken);
  }

  return newAccessToken;
};

// 세션 만료 처리 (localStorage 정리 + 로그인 페이지 이동)
// ★ 중복 호출 방지: 한 번만 실행, 이후 호출은 무시
const handleSessionExpired = () => {
  // 이미 로그인 페이지에 있으면 중복 리다이렉트 방지
  if (window.location.pathname === '/login') return;

  // ★ 이미 세션 만료 처리 중이면 무시 (연쇄 호출 방지)
  if (isSessionExpiring) return;
  isSessionExpiring = true;

  console.warn('[api] 세션 만료 처리 시작');

  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  sessionStorage.setItem('sessionExpired', 'true');

  // AuthContext 등 리스너에게 즉시 알림 (React state 동기화)
  window.dispatchEvent(new Event('session-expired'));

  window.location.href = '/login';
};

// 요청 인터셉터 (JWT 토큰 자동 추가 + ★ 만료 토큰 사전 갱신)
api.interceptors.request.use(
  async (config) => {
    // 인증이 필요없는 요청은 통과
    const isAuthRequest = config.url?.includes('/api/auth/login') ||
                          config.url?.includes('/api/auth/register') ||
                          config.url?.includes('/api/auth/refresh');
    if (isAuthRequest) return config;

    let token = localStorage.getItem('authToken');

    // ★ 토큰이 없으면 즉시 세션 만료 처리
    if (!token || token === 'undefined' || token === 'null') {
      handleSessionExpired();
      return Promise.reject(new axios.Cancel('세션이 만료되었습니다.'));
    }

    // ★ Access token이 만료된 경우: 요청 전에 사전 갱신 시도
    if (isTokenExpired(token)) {
      // Refresh token도 만료 → 즉시 로그아웃
      if (isRefreshTokenExpired()) {
        handleSessionExpired();
        return Promise.reject(new axios.Cancel('세션이 만료되었습니다.'));
      }

      // ★ 이미 갱신 중이면 큐에서 대기 후 새 토큰으로 요청
      if (isRefreshing) {
        try {
          token = await new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          });
        } catch (err) {
          return Promise.reject(new axios.Cancel('토큰 갱신 실패'));
        }
      } else {
        // ★ 사전 갱신: 만료된 토큰으로 요청을 보내지 않고 먼저 갱신
        isRefreshing = true;
        try {
          token = await refreshAccessToken();
          processQueue(null, token);
        } catch (err) {
          processQueue(err, null);
          isRefreshing = false;
          handleSessionExpired();
          return Promise.reject(new axios.Cancel('세션이 만료되었습니다.'));
        } finally {
          isRefreshing = false;
        }
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

      try {
        const newAccessToken = await refreshAccessToken();
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

    // ★ 403 Forbidden: 백엔드 인증 에러만 세션 만료로 처리
    // CloudFront/WAF/인프라에서 오는 403은 세션 만료가 아님
    if (error.response?.status === 403) {
      const responseData = error.response?.data;
      const isAuthForbidden = responseData &&
        typeof responseData === 'object' &&
        (responseData.error === 'FORBIDDEN' || responseData.error === 'UNAUTHORIZED' ||
         responseData.status === 403 || responseData.status === 401) &&
        typeof responseData.message === 'string';

      if (isAuthForbidden) {
        console.warn('[api] 백엔드 인증 403 → 세션 만료 처리:', responseData.message);
        handleSessionExpired();
      } else {
        // ★ 인프라 403 (CloudFront/WAF 등): 세션 만료로 처리하지 않음
        console.warn('[api] 인프라 403 감지 (세션 만료 아님):', originalRequest.url);
      }
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
