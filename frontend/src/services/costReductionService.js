/**
 * costReductionService - 비용 절감 대시보드 API 서비스
 *
 * 비용 절감 프로세스 전체의 API를 제공한다.
 *
 * 주요 기능 그룹:
 * - Dashboard: 초기화, 상태 조회, 단계 전환, 잠금, 초기화
 * - Editor Lock: 편집자 잠금 획득/하트비트/해제 (동시 편집 방지)
 * - Long List / Short List: 트리 조회, 통계, 차트, 선택 저장/조회, Raw Data
 * - Clustering Excel Import: 엑셀 파일 업로드를 통한 클러스터 직접 반영
 * - Able Tasks: 과제 CRUD, 요약, 잠금 통계 ID 조회
 * - Task Documents: 과제 첨부 문서/링크 관리
 * - Weekly Progress: 주간 진행률 CRUD
 * - Dashboard Batch Generation: 대시보드 일괄 생성
 */
import api from './api';

const costReductionService = {
  // ===== Dashboard 상태 관리 =====

  /** POST .../dashboard/init - 대시보드 초기화 (최초 1회) */
  initDashboard: async (projectId) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/init`);
    return response.data;
  },

  /** GET .../dashboard/status - 대시보드 현재 상태(단계, 잠금 등) 조회 */
  getStatus: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/dashboard/status`);
    return response.data;
  },

  /** POST .../dashboard/transition - 대시보드 단계 전환 (Long List → Short List 등) */
  transitionPhase: async (projectId, targetPhase) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/transition`, {
      targetPhase,
    });
    return response.data;
  },

  /** POST .../dashboard/unlock-list - 리스트 잠금 해제 (편집 재허용) */
  unlockList: async (projectId) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/unlock-list`);
    return response.data;
  },

  // ===== Dashboard Lock Check (세션 완료 시 사전 체크) =====

  /** GET .../dashboard/lock-status - 대시보드 잠금 상태 사전 체크 */
  checkDashboardLockStatus: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/dashboard/lock-status`);
    return response.data;
  },

  /** DELETE .../dashboard/reset - 대시보드 전체 초기화 (데이터 삭제) */
  resetDashboard: async (projectId) => {
    const response = await api.delete(`/api/projects/${projectId}/dashboard/reset`);
    return response.data;
  },

  // ===== Editor Lock =====

  /** POST .../dashboard/lock/acquire - 편집자 잠금 획득 (Redis 기반) */
  acquireLock: async (projectId) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/lock/acquire`);
    return response.data;
  },

  /** POST .../dashboard/lock/heartbeat - 편집자 잠금 하트비트 (TTL 갱신) */
  heartbeat: async (projectId) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/lock/heartbeat`);
    return response.data;
  },

  /** POST .../dashboard/lock/release - 편집자 잠금 해제 */
  releaseLock: async (projectId) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/lock/release`);
    return response.data;
  },

  // ===== Long List =====

  getLongListTree: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/longlist/tree`);
    return response.data;
  },

  getLongListStats: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/longlist/stats`);
    return response.data;
  },

  getLongListChart: async (projectId, statisticsId, top = 5) => {
    const response = await api.get(`/api/projects/${projectId}/longlist/chart/${statisticsId}`, {
      params: { top },
    });
    return response.data;
  },

  getLongListAccountChart: async (projectId, accountName, top = 5) => {
    const response = await api.get(`/api/projects/${projectId}/longlist/chart/account/${encodeURIComponent(accountName)}`, {
      params: { top },
    });
    return response.data;
  },

  getLongListItemStats: async (projectId, statisticsId) => {
    const response = await api.get(`/api/projects/${projectId}/longlist/item-stats/${statisticsId}`);
    return response.data;
  },

  getLongListAccountItemStats: async (projectId, accountName) => {
    const response = await api.get(`/api/projects/${projectId}/longlist/item-stats/account/${encodeURIComponent(accountName)}`);
    return response.data;
  },

  saveLongListSelections: async (projectId, items) => {
    const response = await api.post(`/api/projects/${projectId}/longlist/save`, { items }, {
      timeout: 300000, // 5분 타임아웃 (대량 데이터 저장용)
    });
    return response.data;
  },

  // ★ 경량 저장: statisticsId 목록만 전송 (WAF body size 제한 우회)
  saveLongListSelectionsByIds: async (projectId, statisticsIds) => {
    const response = await api.post(`/api/projects/${projectId}/longlist/save-by-ids`, { statisticsIds }, {
      timeout: 300000,
    });
    return response.data;
  },

  getLongListSelections: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/longlist/selections`);
    return response.data;
  },

  getLongListRawData: async (projectId, statisticsId, page = 0, size = 20) => {
    const response = await api.get(`/api/projects/${projectId}/longlist/raw-data/${statisticsId}`, {
      params: { page, size },
    });
    return response.data;
  },

  getLongListAccountRawData: async (projectId, accountName, page = 0, size = 20) => {
    const response = await api.get(`/api/projects/${projectId}/longlist/raw-data/account/${encodeURIComponent(accountName)}`, {
      params: { page, size },
    });
    return response.data;
  },

  // ===== Short List =====

  getShortListTree: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/shortlist/tree`);
    return response.data;
  },

  getShortListStats: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/shortlist/stats`);
    return response.data;
  },

  getShortListChart: async (projectId, statisticsId, top = 5) => {
    const response = await api.get(`/api/projects/${projectId}/shortlist/chart/${statisticsId}`, {
      params: { top },
    });
    return response.data;
  },

  getShortListAccountChart: async (projectId, accountName, top = 5) => {
    const response = await api.get(`/api/projects/${projectId}/shortlist/chart/account/${encodeURIComponent(accountName)}`, {
      params: { top },
    });
    return response.data;
  },

  getShortListItemStats: async (projectId, statisticsId) => {
    const response = await api.get(`/api/projects/${projectId}/shortlist/item-stats/${statisticsId}`);
    return response.data;
  },

  getShortListAccountItemStats: async (projectId, accountName) => {
    const response = await api.get(`/api/projects/${projectId}/shortlist/item-stats/account/${encodeURIComponent(accountName)}`);
    return response.data;
  },

  saveShortListSelections: async (projectId, items) => {
    const response = await api.post(`/api/projects/${projectId}/shortlist/save`, { items });
    return response.data;
  },

  getShortListSelections: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/shortlist/selections`);
    return response.data;
  },

  getShortListSelectionTree: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/shortlist/selection-tree`);
    return response.data;
  },

  getShortListRawData: async (projectId, statisticsId, page = 0, size = 20) => {
    const response = await api.get(`/api/projects/${projectId}/shortlist/raw-data/${statisticsId}`, {
      params: { page, size },
    });
    return response.data;
  },

  getShortListAccountRawData: async (projectId, accountName, page = 0, size = 20) => {
    const response = await api.get(`/api/projects/${projectId}/shortlist/raw-data/account/${encodeURIComponent(accountName)}`, {
      params: { page, size },
    });
    return response.data;
  },

  // ===== Clustering Excel Import =====

  importClusteringExcel: async (projectId, { file, accountName, clusterColumn, subClusterColumn, supplierColumn, costCenterColumn, amountColumn }) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('accountName', accountName);
    formData.append('clusterColumn', clusterColumn);
    formData.append('amountColumn', amountColumn);
    if (subClusterColumn) formData.append('subClusterColumn', subClusterColumn);
    if (supplierColumn) formData.append('supplierColumn', supplierColumn);
    if (costCenterColumn) formData.append('costCenterColumn', costCenterColumn);

    const response = await api.post(`/api/projects/${projectId}/dashboard/import/process`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    });
    return response.data;
  },

  // ===== Able Tasks =====

  createTask: async (projectId, data) => {
    const response = await api.post(`/api/projects/${projectId}/tasks`, data);
    return response.data;
  },

  getTasks: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/tasks`);
    return response.data;
  },

  getTaskSummary: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/tasks/summary`);
    return response.data;
  },

  getTask: async (projectId, taskId) => {
    const response = await api.get(`/api/projects/${projectId}/tasks/${taskId}`);
    return response.data;
  },

  updateTask: async (projectId, taskId, data) => {
    const response = await api.put(`/api/projects/${projectId}/tasks/${taskId}`, data);
    return response.data;
  },

  deleteTask: async (projectId, taskId) => {
    const response = await api.delete(`/api/projects/${projectId}/tasks/${taskId}`);
    return response.data;
  },

  resetTask: async (projectId, taskId) => {
    const response = await api.post(`/api/projects/${projectId}/tasks/${taskId}/reset`);
    return response.data;
  },

  getLockedStatisticsIds: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/tasks/locked-statistics`);
    return response.data;
  },

  /** GET .../tasks/export/excel - 과제 목록 Excel 다운로드 */
  exportTasksExcel: async (projectId, status) => {
    const params = status ? { status } : {};
    const response = await api.get(`/api/projects/${projectId}/tasks/export/excel`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  // ===== Task Documents =====

  getTaskDocuments: async (projectId, taskId) => {
    const response = await api.get(`/api/projects/${projectId}/tasks/${taskId}/documents`);
    return response.data;
  },

  addTaskLink: async (projectId, taskId, data) => {
    const response = await api.post(`/api/projects/${projectId}/tasks/${taskId}/documents/link`, data);
    return response.data;
  },

  getTaskUploadUrl: async (projectId, taskId, fileName) => {
    const response = await api.post(`/api/projects/${projectId}/tasks/${taskId}/documents/upload-url`, null, {
      params: { fileName },
    });
    return response.data;
  },

  getDocumentDownloadUrl: async (projectId, taskId, documentId) => {
    const response = await api.get(`/api/projects/${projectId}/tasks/${taskId}/documents/${documentId}/download-url`);
    return response.data;
  },

  deleteTaskDocument: async (projectId, taskId, documentId) => {
    const response = await api.delete(`/api/projects/${projectId}/tasks/${taskId}/documents/${documentId}`);
    return response.data;
  },

  // ===== Weekly Progress =====

  getWeeklyProgress: async (projectId, taskId) => {
    const response = await api.get(`/api/projects/${projectId}/tasks/${taskId}/weekly-progress`);
    return response.data;
  },

  createWeeklyProgress: async (projectId, taskId, data) => {
    const response = await api.post(`/api/projects/${projectId}/tasks/${taskId}/weekly-progress`, data);
    return response.data;
  },

  updateWeeklyProgress: async (projectId, taskId, progressId, data) => {
    const response = await api.put(`/api/projects/${projectId}/tasks/${taskId}/weekly-progress/${progressId}`, data);
    return response.data;
  },

  deleteWeeklyProgress: async (projectId, taskId, progressId) => {
    const response = await api.delete(`/api/projects/${projectId}/tasks/${taskId}/weekly-progress/${progressId}`);
    return response.data;
  },

  // ===== Dashboard Batch Generation =====

  startDashboardGeneration: async (projectId, sessions) => {
    const response = await api.post(
      `/api/projects/${projectId}/dashboard/generate/batch`,
      { sessions },
      { timeout: 300000 }
    );
    return response.data;
  },

  getDashboardGenerationStatus: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/dashboard/generate/status`);
    return response.data;
  },
};

export default costReductionService;
