import api from './api';

const authService = {
    // 회원가입
    register: async (userData) => {
        const response = await api.post('/api/auth/register', userData);
        return response.data;
    },

    // 로그인
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

    // 로그아웃
    logout: () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
    },

    // 현재 사용자 정보
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

    // 프로필 수정 (이름)
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

    // 비밀번호 변경
    changePassword: async (currentPassword, newPassword) => {
        const response = await api.put('/api/auth/profile/password', { currentPassword, newPassword });
        return response.data;
    },

    // 인증 여부 확인
    isAuthenticated: () => {
        const token = localStorage.getItem('authToken');
        // ⭐ 방어 코드 추가
        return !!(token && token !== 'undefined' && token !== 'null');
    },
};

export default authService;