import api from './api';

const costReductionService = {
  // ===== Dashboard =====

  initDashboard: async (projectId) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/init`);
    return response.data;
  },

  getStatus: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/dashboard/status`);
    return response.data;
  },

  transitionPhase: async (projectId, targetPhase) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/transition`, {
      targetPhase,
    });
    return response.data;
  },

  unlockList: async (projectId) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/unlock-list`);
    return response.data;
  },

  // ===== Dashboard Lock Check (세션 완료 시 사전 체크) =====

  checkDashboardLockStatus: async (projectId) => {
    const response = await api.get(`/api/projects/${projectId}/dashboard/lock-status`);
    return response.data;
  },

  resetDashboard: async (projectId) => {
    const response = await api.delete(`/api/projects/${projectId}/dashboard/reset`);
    return response.data;
  },

  // ===== Editor Lock =====

  acquireLock: async (projectId) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/lock/acquire`);
    return response.data;
  },

  heartbeat: async (projectId) => {
    const response = await api.post(`/api/projects/${projectId}/dashboard/lock/heartbeat`);
    return response.data;
  },

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
    const response = await api.post(`/api/projects/${projectId}/longlist/save`, { items });
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

  deleteTaskDocument: async (projectId, taskId, documentId) => {
    const response = await api.delete(`/api/projects/${projectId}/tasks/${taskId}/documents/${documentId}`);
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
