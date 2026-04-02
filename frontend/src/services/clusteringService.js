/**
 * clusteringService - 클러스터링 관련 API 서비스
 *
 * Step 5(Clustering) 단계에서 사용하는 API를 제공한다.
 *
 * 주요 기능:
 * - 클러스터 생성(generateClusters), 미병합/병합 클러스터 조회
 * - 클러스터 병합/해제/부분해제, 3-Phase 배치 병합
 * - 키워드/공급업체 통계, 고급 검색, 클러스터명 변경
 * - 키워드 계층(Lv1/Lv2/Lv3) CRUD
 *
 * 모든 API는 /api/projects/{projectId}/sessions/{sessionId}/clustering/ 하위 경로를 사용한다.
 */
import api from './api';

const clusteringService = {
    /**
     * POST .../clustering/generate - AI 기반 클러스터 자동 생성
     * @param {Object} options - { includeSupplier, includeCostCenter } 포함 여부
     */
    generateClusters: async (projectId, sessionId, options = {}) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/generate`,
            { includeSupplier: !!options.includeSupplier, includeCostCenter: !!options.includeCostCenter }
        );
        return response.data;
    },

    /** GET .../clustering/unmerged - 미병합 클러스터 페이징 조회 */
    getUnmergedClusters: async (projectId, sessionId, page = 0, size = 20, keyword = null) => {
        const params = { page, size };
        if (keyword) params.keyword = keyword;
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/unmerged`, { params }
        );
        return response.data;
    },

    /** GET .../clustering/unmerged-ids - 미병합 클러스터 번호 전체 목록 (병합 시 선택용) */
    getAllUnmergedClusterNumbers: async (projectId, sessionId, keyword = null, supplier = null) => {
        const params = {};
        if (keyword) params.keyword = keyword;
        if (supplier) params.supplier = supplier;
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/unmerged-ids`, { params }
        );
        return response.data;
    },

    /** GET .../clustering/keyword-stats - 키워드별 통계 (건수, 금액) */
    getKeywordStats: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/keyword-stats`
        );
        return response.data;
    },

    /** GET .../clustering/supplier-stats - 공급업체별 통계 */
    getSupplierStats: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/supplier-stats`
        );
        return response.data;
    },

    /** GET .../clustering/merged - 병합된 클러스터 목록 조회 */
    getMergedClusters: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merged`
        );
        return response.data;
    },

    /** GET .../clustering/merged/{clusterNumber}/children - 병합 클러스터의 자식 목록 (페이징) */
    getMergedClusterChildren: async (projectId, sessionId, clusterNumber, page = 0, size = 50) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merged/${clusterNumber}/children`,
            { params: { page, size } }
        );
        return response.data;
    },

    /** GET .../clustering/statistics - 클러스터링 전체 통계 */
    getStatistics: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/statistics`
        );
        return response.data;
    },

    /** POST .../clustering/merge - 선택한 클러스터 번호들을 병합 */
    mergeClusters: async (projectId, sessionId, clusterNumbers, customMergeName = null) => {
        const body = { clusterNumbers };
        if (customMergeName) body.customMergeName = customMergeName;
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge`,
            body
        );
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
            throw new Error('서버 응답 시간이 초과되었습니다. 잠시 후 새로고침해주세요.');
        }
        return response.data;
    },

    /** selectAll 필터 방식 병합: POST body 크기를 줄이기 위해 번호 대신 필터를 전송 */
    mergeClustersWithFilter: async (projectId, sessionId, { exceptions = [], keyword = null, supplier = null, exactMatch = true } = {}) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge`,
            { selectAll: true, exceptions, keyword, supplier, exactMatch }
        );
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
            throw new Error('서버 응답 시간이 초과되었습니다. 잠시 후 새로고침해주세요.');
        }
        return response.data;
    },

    /** 3-Phase 배치 병합: Phase 1 - 빈 부모 생성 */
    mergeStart: async (projectId, sessionId, customMergeName = null) => {
        const body = {};
        if (customMergeName) body.customMergeName = customMergeName;
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge/start`,
            body
        );
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
            throw new Error('서버 응답 시간이 초과되었습니다. 잠시 후 새로고침해주세요.');
        }
        return response.data;
    },

    /** 3-Phase 배치 병합: Phase 2 - 배치 단위 자식 편입 */
    mergeBatch: async (projectId, sessionId, mergedClusterNumber, clusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge/batch`,
            { mergedClusterNumber, clusterNumbers }
        );
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
            throw new Error('서버 응답 시간이 초과되었습니다. 잠시 후 새로고침해주세요.');
        }
        return response.data;
    },

    /** 3-Phase 배치 병합: Phase 3 - 부모 재계산 */
    mergeFinalize: async (projectId, sessionId, mergedClusterNumber, customMergeName = null) => {
        const body = { mergedClusterNumber };
        if (customMergeName) body.customMergeName = customMergeName;
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge/finalize`,
            body
        );
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
            throw new Error('서버 응답 시간이 초과되었습니다. 잠시 후 새로고침해주세요.');
        }
        return response.data;
    },

    /** GET .../clustering/merge/progress/{taskId} - 병합 작업 진행률 조회 */
    getMergeProgress: async (projectId, sessionId, taskId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge/progress/${taskId}`
        );
        return response.data;
    },

    /** 세션에 활성 병합 작업이 있는지 확인 */
    isMergeActive: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge/active`
        );
        return response.data;
    },

    /** POST .../clustering/unmerge - 병합 클러스터 전체 해제 */
    unmergeClusters: async (projectId, sessionId, mergedClusterNumber) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/unmerge`,
            { mergedClusterNumber }
        );
        return response.data;
    },

    /** 부분 병합 해제 (선택한 자식만) */
    unmergePartialClusters: async (projectId, sessionId, mergedClusterNumber, childClusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/unmerge-partial`,
            { mergedClusterNumber, childClusterNumbers }
        );
        return response.data;
    },

    /** 병합 클러스터끼리 병합 */
    mergeMergedClusters: async (projectId, sessionId, mergedClusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/merge-merged`,
            { mergedClusterNumbers }
        );
        return response.data;
    },

    /** 추가 병합 (기존 병합 클러스터에 미병합 항목 추가) */
    addToMergedCluster: async (projectId, sessionId, targetMergedClusterNumber, clusterNumbers) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/add-to-merged`,
            { targetMergedClusterNumber, clusterNumbers }
        );
        return response.data;
    },

    /** POST .../clustering/auto-merge-undefined - "미분류" 클러스터 자동 병합 */
    autoMergeUndefined: async (projectId, sessionId) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/auto-merge-undefined`
        );
        return response.data;
    },

    /** PUT .../clustering/rename - 클러스터명 변경 */
    renameCluster: async (projectId, sessionId, clusterNumber, newName) => {
        const response = await api.put(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/rename`,
            { clusterNumber, newName }
        );
        return response.data;
    },

    // ============================================================
    // 고급 검색 API
    // ============================================================

    /** 고급 검색 (컬럼 선택, 완전일치, 제외, 결과내 재검색) */
    advancedSearch: async (projectId, sessionId, params) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/advanced-search`,
            params
        );
        return response.data;
    },

    /** 고급 검색 결과의 전체 clusterNumber 목록 조회 */
    getAdvancedSearchClusterNumbers: async (projectId, sessionId, params) => {
        const response = await api.post(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/advanced-search-ids`,
            params
        );
        return response.data;
    },

    /** 검색 가능한 컬럼 목록 조회 */
    getSearchableColumns: async (projectId, sessionId) => {
        const response = await api.get(
            `/api/projects/${projectId}/sessions/${sessionId}/clustering/searchable-columns`
        );
        return response.data;
    },

    // ============================================================
    // 키워드 계층 API (Lv1/Lv2/Lv3)
    // ============================================================

    /** 키워드 계층 전체 조회 (프로젝트 단위) */
    getKeywordHierarchy: async (projectId) => {
        const response = await api.get(
            `/api/projects/${projectId}/clustering/keyword-hierarchy`
        );
        return response.data;
    },

    /** 키워드 추가 (프로젝트 단위) */
    addKeywordHierarchy: async (projectId, level, parentId, keyword) => {
        const response = await api.post(
            `/api/projects/${projectId}/clustering/keyword-hierarchy`,
            { level, parentId, keyword }
        );
        return response.data;
    },

    /** 키워드 수정 (프로젝트 단위) */
    updateKeywordHierarchy: async (projectId, id, keyword) => {
        const response = await api.put(
            `/api/projects/${projectId}/clustering/keyword-hierarchy/${id}`,
            { keyword }
        );
        return response.data;
    },

    /** 키워드 삭제 (프로젝트 단위) */
    deleteKeywordHierarchy: async (projectId, id) => {
        const response = await api.delete(
            `/api/projects/${projectId}/clustering/keyword-hierarchy/${id}`
        );
        return response.data;
    },
};

export default clusteringService;
