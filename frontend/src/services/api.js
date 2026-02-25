import axios from 'axios';

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
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  sessionStorage.setItem('sessionExpired', 'true');
  window.location.href = '/login';
};

// 요청 인터셉터 (JWT 토큰 자동 추가)
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token && token !== 'undefined' && token !== 'null') {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // 401 에러이고, 아직 재시도하지 않은 요청인 경우
    if (error.response?.status === 401 && !originalRequest._retry) {
      // 로그인/리프레시 요청 자체가 401이면 바로 로그아웃
      if (originalRequest.url?.includes('/api/auth/login') ||
          originalRequest.url?.includes('/api/auth/refresh')) {
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
