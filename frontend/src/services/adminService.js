import api from './api';

const adminService = {
    // ========== 사용자 ==========
    getUsers: () => api.get('/api/admin/users'),
    approveUser: (userId) => api.put(`/api/admin/users/${userId}/approve`),
    revokeUser: (userId) => api.put(`/api/admin/users/${userId}/revoke`),
    deleteUser: (userId) => api.delete(`/api/admin/users/${userId}`),
    bulkApprove: (userIds) => api.put('/api/admin/users/bulk-approve', { userIds }),
    bulkRevoke: (userIds) => api.put('/api/admin/users/bulk-revoke', { userIds }),
    updateUserInfo: (userId, name, email) =>
        api.put(`/api/admin/users/${userId}/info`, { name, email }),
    resetUserPassword: (userId, newPassword) =>
        api.put(`/api/admin/users/${userId}/password`, { newPassword }),

    // ========== 비밀번호 ==========
    changePassword: (currentPassword, newPassword) =>
        api.put('/api/admin/profile/password', { currentPassword, newPassword }),

    // ========== 프로젝트 ==========
    getProjects: () => api.get('/api/admin/projects'),
    getProjectDetail: (projectId) => api.get(`/api/admin/projects/${projectId}`),
    updateMemberRole: (projectId, userId, role) =>
        api.put(`/api/admin/projects/${projectId}/members/${userId}/role`, { role }),
    addProjectMember: (projectId, userId, role) =>
        api.post(`/api/admin/projects/${projectId}/members`, { userId, role }),
    removeProjectMember: (projectId, userId) =>
        api.delete(`/api/admin/projects/${projectId}/members/${userId}`),

    // ========== S3 ==========
    getS3Files: () => api.get('/api/admin/s3/files'),
    getOrphanedFiles: () => api.get('/api/admin/s3/orphaned'),
    deleteS3Files: (s3Keys) => api.delete('/api/admin/s3/files', { data: { s3Keys } }),
    cleanupOrphaned: () => api.post('/api/admin/s3/cleanup'),

    // ========== 세션 ==========
    getSessions: () => api.get('/api/admin/sessions'),
    resetSession: (sessionId) => api.post(`/api/admin/sessions/${sessionId}/reset`),

    // ========== 대시보드 ==========
    getStats: () => api.get('/api/admin/stats'),

    // ========== 감사 로그 ==========
    getLogs: (params) => api.get('/api/admin/logs', { params }),

    // ========== 사용자 활동 로그 ==========
    logUserActivity: (action, targetType, targetId, detail) =>
        api.post('/api/admin/user-activity', { action, targetType, targetId, detail }).catch(() => {}),
};

export default adminService;
