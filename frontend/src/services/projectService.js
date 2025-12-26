import api from './api';

const projectService = {
    // 프로젝트 생성
    createProject: async (projectData) => {
        const response = await api.post('/api/projects', projectData);
        return response.data;
    },

    // 내 프로젝트 목록
    getMyProjects: async () => {
        const response = await api.get('/api/projects');
        return response.data;
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
        return response.data;
    },


    // 멤버 초대
    inviteMember: async (projectId, memberData) => {
        const response = await api.post(`/api/projects/${projectId}/members`, memberData);
        return response.data;
    },

    // ⭐ 멤버 목록 조회 (신규 추가)
    getProjectMembers: async (projectId) => {
        const response = await api.get(`/api/projects/${projectId}`);
        // Project 객체에서 members 필드만 추출
        return response.data.members || [];
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
};

export default projectService;