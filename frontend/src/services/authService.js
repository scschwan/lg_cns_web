/**
 * authService - 인증 관련 API 서비스
 *
 * 회원가입, 로그인, 로그아웃, 프로필 수정, 비밀번호 변경 등
 * 사용자 인증과 관련된 모든 API 호출 및 localStorage 토큰 관리를 담당한다.
 *
 * 토큰 저장소:
 * - localStorage.authToken: JWT Access Token
 * - localStorage.refreshToken: JWT Refresh Token
 * - localStorage.user: 사용자 정보 JSON
 */
import api from './api';

const authService = {
    /** POST /api/auth/register - 회원가입 */
    register: async (userData) => {
        const response = await api.post('/api/auth/register', userData);
        return response.data;
    },

    /**
     * POST /api/auth/login - 로그인
     * @param {{ email: string, password: string }} credentials - 로그인 정보
     * @returns {{ accessToken, refreshToken, userId, email, name, role }} 인증 결과
     */
    login: async (credentials) => {
        const response = await api.post('/api/auth/login', credentials);

        // 백엔드 응답 구조에 맞게 수정
        const { accessToken, refreshToken, userId, email, name, role } = response.data;

        // 토큰 저장
        localStorage.setItem('authToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);

        // 사용자 정보 저장
        const user = { userId, email, name, role };
        localStorage.setItem('user', JSON.stringify(user));

        return response.data;
    },

    /** 로그아웃 - localStorage에서 토큰 및 사용자 정보 제거 */
    logout: () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
    },

    /** localStorage에서 현재 사용자 정보를 파싱하여 반환 (없으면 null) */
    getCurrentUser: () => {
        try {
            const userStr = localStorage.getItem('user');

            // ⭐ 방어 코드 추가
            if (!userStr || userStr === 'undefined' || userStr === 'null') {
                return null;
            }

            return JSON.parse(userStr);
        } catch (error) {
            // ⭐ JSON 파싱 실패 시 localStorage 정리
            console.error('localStorage user 파싱 실패:', error);
            localStorage.removeItem('user');
            return null;
        }
    },

    /**
     * PUT /api/auth/profile - 프로필 수정 (이름)
     * localStorage의 user 정보도 동기화한다.
     */
    updateProfile: async (name) => {
        const response = await api.put('/api/auth/profile', { name });
        // localStorage 동기화
        const current = authService.getCurrentUser();
        if (current) {
            const updated = { ...current, name: response.data.name };
            localStorage.setItem('user', JSON.stringify(updated));
        }
        return response.data;
    },

    /** PUT /api/auth/profile/password - 비밀번호 변경 */
    changePassword: async (currentPassword, newPassword) => {
        const response = await api.put('/api/auth/profile/password', { currentPassword, newPassword });
        return response.data;
    },

    /** 클라이언트 측 인증 여부 확인 (토큰 존재 여부로 판단) */
    isAuthenticated: () => {
        const token = localStorage.getItem('authToken');
        // ⭐ 방어 코드 추가
        return !!(token && token !== 'undefined' && token !== 'null');
    },
};

export default authService;