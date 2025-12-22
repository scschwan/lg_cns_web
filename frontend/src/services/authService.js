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
        const { token, user } = response.data;

        // 토큰 저장
        localStorage.setItem('authToken', token);
        localStorage.setItem('user', JSON.stringify(user));

        return response.data;
    },

    // 로그아웃
    logout: () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
    },

    // 현재 사용자 정보
    getCurrentUser: () => {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    },

    // 인증 여부 확인
    isAuthenticated: () => {
        return !!localStorage.getItem('authToken');
    },
};

export default authService;