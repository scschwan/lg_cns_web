// frontend/src/constants/colors.js

/**
 * C# WinForms FinanceTool 색상 테마
 * 기존 UI와 동일한 색상 사용
 */

export const COLORS = {
    // 헤더 및 타이틀
    HEADER_BG: '#4682B4',          // SteelBlue
    HEADER_TEXT: '#FFFFFF',        // White

    // 버튼 색상
    BTN_COMPLETE: '#32CD32',       // LimeGreen - 완료 버튼
    BTN_SEARCH: '#1E90FF',         // DodgerBlue - 검색 버튼
    BTN_APPLY: '#FFA500',          // Orange - 적용 버튼
    BTN_DELETE: '#DC143C',         // Crimson - 삭제 버튼
    BTN_MERGE: '#4169E1',          // RoyalBlue - 병합 버튼
    BTN_ADD: '#20B2AA',            // LightSeaGreen - 추가 버튼

    // 테이블 색상
    GRID_HEADER_BG: '#B0C4DE',     // LightSteelBlue
    GRID_ROW_EVEN: '#F0F8FF',      // AliceBlue
    GRID_ROW_ODD: '#FFFFFF',       // White
    GRID_BORDER: '#D3D3D3',        // LightGray

    // 경고/안내 텍스트
    WARNING_TEXT: '#CD5C5C',       // IndianRed

    // 배경
    PANEL_BG: '#F5F5F5',           // WhiteSmoke
    CONTENT_BG: '#FFFFFF',         // White
};

// MUI 버튼 스타일 프리셋
export const BUTTON_STYLES = {
    complete: {
        backgroundColor: COLORS.BTN_COMPLETE,
        color: '#FFFFFF',
        '&:hover': {
            backgroundColor: '#28a745',
        },
    },
    search: {
        backgroundColor: COLORS.BTN_SEARCH,
        color: '#FFFFFF',
        '&:hover': {
            backgroundColor: '#1976d2',
        },
    },
    apply: {
        backgroundColor: COLORS.BTN_APPLY,
        color: '#FFFFFF',
        '&:hover': {
            backgroundColor: '#e69500',
        },
    },
    delete: {
        backgroundColor: COLORS.BTN_DELETE,
        color: '#FFFFFF',
        '&:hover': {
            backgroundColor: '#c82333',
        },
    },
    merge: {
        backgroundColor: COLORS.BTN_MERGE,
        color: '#FFFFFF',
        '&:hover': {
            backgroundColor: '#3a5fcd',
        },
    },
    add: {
        backgroundColor: COLORS.BTN_ADD,
        color: '#FFFFFF',
        '&:hover': {
            backgroundColor: '#1a9a8a',
        },
    },
};
