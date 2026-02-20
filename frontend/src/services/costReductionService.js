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

  getLongListItemStats: async (projectId, statisticsId) => {
    const response = await api.get(`/api/projects/${projectId}/longlist/item-stats/${statisticsId}`);
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
};

export default costReductionService;
