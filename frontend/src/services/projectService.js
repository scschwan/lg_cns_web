/**
 * projectService - 프로젝트 관리 API 서비스
 *
 * 프로젝트 CRUD, 멤버 초대/역할변경/삭제, 파일 목록 조회 등
 * 프로젝트 관련 전반적인 API를 제공한다.
 *
 * 모든 API는 /api/projects/ 하위 경로를 사용한다.
 */
import api from './api';

/**
 * API 응답에서 배열 데이터를 안전하게 추출
 * - 배열이면 그대로 반환
 * - 래핑된 객체(content, data 등)면 내부 배열 추출
 * - 그 외에는 빈 배열 반환
 */
const extractArray = (data) => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
        // Spring Page 응답: { content: [...], totalElements: ... }
        if (Array.isArray(data.content)) return data.content;
        // 래핑된 응답: { data: [...] }
        if (Array.isArray(data.data)) return data.data;
    }
    console.warn('[projectService] 예상치 못한 API 응답 형식:', typeof data, data);
    return [];
};

const projectService = {
    // 프로젝트 생성
    createProject: async (projectData) => {
        const response = await api.post('/api/projects', projectData);
        return response.data;
    },

    // 내 프로젝트 목록
    getMyProjects: async () => {
        const response = await api.get('/api/projects');
        return extractArray(response.data);
    },

    // 프로젝트 상세
    getProject: async (projectId) => {
        const response = await api.get(`/api/projects/${projectId}`);
        return response.data;
    },

    // 프로젝트 수정
    updateProject: async (projectId, projectData) => {
        const response = await api.put(`/api/projects/${projectId}`, projectData);
        return response.data;
    },

    // 프로젝트 삭제
    deleteProject: async (projectId) => {
        await api.delete(`/api/projects/${projectId}`);
    },

    // ============================================
    // ⭐ 신규 추가: 프로젝트 파일 목록 조회
    // ============================================

    /**
     * 프로젝트에 업로드된 파일 목록 조회
     * GET /api/projects/{projectId}/files
     */
    getProjectFiles: async (projectId) => {
        const response = await api.get(`/api/projects/${projectId}/files`);
        return extractArray(response.data);
    },


    // 멤버 초대
   /**
      * 멤버 초대
      * @param {string} projectId
      * @param {string} email
      * @param {string} role
      */
     inviteMember: async (projectId, email, role) => {
       // ❌ 기존 (추정): 이렇게 되어 있어서 문자열만 전송됨
       // return api.post(`/projects/${projectId}/members`, email);

       // ✅ 수정: email과 role을 객체에 담아서 전송해야 함
       const payload = {
         email: email,
         role: role
       };
       return api.post(`/api/projects/${projectId}/members`, payload);
     },

    // ⭐ 멤버 목록 조회 (신규 추가)
    getProjectMembers: async (projectId) => {
        const response = await api.get(`/api/projects/${projectId}`);
        // Project 객체에서 members 필드만 추출
        const members = response.data?.members;
        return Array.isArray(members) ? members : [];
    },

    // 멤버 권한 변경
    updateMemberRole: async (projectId, userId, role) => {
        const response = await api.put(
            `/api/projects/${projectId}/members/${userId}?role=${role}`
        );
        return response.data;
    },

    // 멤버 삭제
    removeMember: async (projectId, userId) => {
        await api.delete(`/api/projects/${projectId}/members/${userId}`);
    },

    // 프로젝트 완료 처리
    completeProject: async (projectId) => {
        const response = await api.post(`/api/projects/${projectId}/complete`);
        return response.data;
    },
};

export default projectService;