/**
 * adminService - 관리자 전용 API 서비스
 *
 * 시스템 관리자(ADMIN)만 접근 가능한 API를 호출한다.
 *
 * 제공 기능:
 * - 사용자 관리: 승인/거부, 일괄 처리, 정보 수정, 비밀번호 초기화
 * - 프로젝트 관리: 목록 조회, 멤버 역할 변경, 멤버 추가/삭제
 * - S3 파일 관리: 파일 목록, 고아 파일 정리, 파일 삭제
 * - 세션 관리: 목록 조회, 세션 초기화
 * - 대시보드 통계, 감사 로그, 사용자 활동 로그
 * - 유지보수 모드 제어, Lambda 상태 초기화
 */
import api from './api';

const adminService = {
    // ========== 사용자 관리 ==========
    /** GET /api/admin/users - 전체 사용자 목록 조회 */
    getUsers: () => api.get('/api/admin/users'),
    /** PUT /api/admin/users/{userId}/approve - 사용자 승인 */
    approveUser: (userId) => api.put(`/api/admin/users/${userId}/approve`),
    /** PUT /api/admin/users/{userId}/revoke - 사용자 권한 취소 */
    revokeUser: (userId) => api.put(`/api/admin/users/${userId}/revoke`),
    /** DELETE /api/admin/users/{userId} - 사용자 삭제 */
    deleteUser: (userId) => api.delete(`/api/admin/users/${userId}`),
    /** PUT /api/admin/users/bulk-approve - 사용자 일괄 승인 */
    bulkApprove: (userIds) => api.put('/api/admin/users/bulk-approve', { userIds }),
    /** PUT /api/admin/users/bulk-revoke - 사용자 일괄 거부 */
    bulkRevoke: (userIds) => api.put('/api/admin/users/bulk-revoke', { userIds }),
    /** PUT /api/admin/users/{userId}/info - 사용자 정보(이름, 이메일) 수정 */
    updateUserInfo: (userId, name, email) =>
        api.put(`/api/admin/users/${userId}/info`, { name, email }),
    /** PUT /api/admin/users/{userId}/password - 사용자 비밀번호 초기화 */
    resetUserPassword: (userId, newPassword) =>
        api.put(`/api/admin/users/${userId}/password`, { newPassword }),

    // ========== 관리자 비밀번호 ==========
    /** PUT /api/admin/profile/password - 관리자 자신의 비밀번호 변경 */
    changePassword: (currentPassword, newPassword) =>
        api.put('/api/admin/profile/password', { currentPassword, newPassword }),

    // ========== 프로젝트 관리 ==========
    /** GET /api/admin/projects - 전체 프로젝트 목록 조회 */
    getProjects: () => api.get('/api/admin/projects'),
    /** GET /api/admin/projects/{projectId} - 프로젝트 상세 조회 */
    getProjectDetail: (projectId) => api.get(`/api/admin/projects/${projectId}`),
    /** PUT /api/admin/projects/{projectId}/members/{userId}/role - 멤버 역할 변경 */
    updateMemberRole: (projectId, userId, role) =>
        api.put(`/api/admin/projects/${projectId}/members/${userId}/role`, { role }),
    /** POST /api/admin/projects/{projectId}/members - 프로젝트 멤버 추가 */
    addProjectMember: (projectId, userId, role) =>
        api.post(`/api/admin/projects/${projectId}/members`, { userId, role }),
    /** DELETE /api/admin/projects/{projectId}/members/{userId} - 프로젝트 멤버 삭제 */
    removeProjectMember: (projectId, userId) =>
        api.delete(`/api/admin/projects/${projectId}/members/${userId}`),

    // ========== S3 파일 관리 ==========
    /** GET /api/admin/s3/files - S3 파일 전체 목록 조회 */
    getS3Files: () => api.get('/api/admin/s3/files'),
    /** GET /api/admin/s3/orphaned - DB에 참조되지 않는 고아 파일 목록 */
    getOrphanedFiles: () => api.get('/api/admin/s3/orphaned'),
    /** DELETE /api/admin/s3/files - 지정한 S3 키 목록 삭제 */
    deleteS3Files: (s3Keys) => api.delete('/api/admin/s3/files', { data: { s3Keys } }),
    /** POST /api/admin/s3/cleanup - 고아 파일 일괄 정리 */
    cleanupOrphaned: () => api.post('/api/admin/s3/cleanup'),

    // ========== 세션 관리 ==========
    /** GET /api/admin/sessions - 전체 세션 목록 조회 */
    getSessions: () => api.get('/api/admin/sessions'),
    /** POST /api/admin/sessions/{sessionId}/reset - 세션 초기화 */
    resetSession: (sessionId) => api.post(`/api/admin/sessions/${sessionId}/reset`),

    // ========== 대시보드 통계 ==========
    /** GET /api/admin/stats - 시스템 전체 통계 조회 */
    getStats: () => api.get('/api/admin/stats'),

    // ========== 감사 로그 ==========
    /** GET /api/admin/logs - 감사 로그 조회 (페이징, 필터 지원) */
    getLogs: (params) => api.get('/api/admin/logs', { params }),

    // ========== 사용자 활동 로그 ==========
    /** POST /api/admin/user-activity - 사용자 활동 기록 (실패 시 무시) */
    logUserActivity: (action, targetType, targetId, detail) =>
        api.post('/api/admin/user-activity', { action, targetType, targetId, detail }).catch(() => {}),

    // ========== 유지보수 모드 ==========
    /** POST /api/admin/maintenance-mode - 유지보수 모드 활성화/비활성화 */
    setMaintenanceMode: (enabled, reason) =>
        api.post('/api/admin/maintenance-mode', { enabled, reason }),
    /** POST /api/admin/reset-lambda-status - Lambda 실행 상태 초기화 */
    resetLambdaStatus: () =>
        api.post('/api/admin/reset-lambda-status'),
};

export default adminService;
