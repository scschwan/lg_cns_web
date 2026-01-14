// frontend/src/components/common/ActionButton.jsx

import React from 'react';
import { Button } from '@mui/material';
import { BUTTON_STYLES } from '../../constants/colors';

/**
 * C# WinForms 버튼 색상 스타일을 반영한 MUI Button 래퍼
 * 
 * @param {string} variant - 버튼 타입: 'complete' | 'search' | 'apply' | 'delete' | 'merge' | 'add'
 * @param {string} children - 버튼 텍스트
 * @param {function} onClick - 클릭 핸들러
 * @param {boolean} disabled - 비활성화 여부
 * @param {object} sx - 추가 스타일
 * @param {string} size - 버튼 크기: 'small' | 'medium' | 'large'
 */
function ActionButton({
    variant = 'apply',
    children,
    onClick,
    disabled = false,
    sx = {},
    size = 'medium',
    startIcon,
    endIcon,
    ...props
}) {
    const buttonStyle = BUTTON_STYLES[variant] || BUTTON_STYLES.apply;

    return (
        <Button
            variant="contained"
            onClick={onClick}
            disabled={disabled}
            size={size}
            startIcon={startIcon}
            endIcon={endIcon}
            sx={{
                fontFamily: 'Pretendard, sans-serif',
                fontWeight: 'bold',
                fontSize: size === 'small' ? '12px' : size === 'large' ? '16px' : '14px',
                padding: size === 'small' ? '4px 12px' : size === 'large' ? '12px 24px' : '8px 16px',
                borderRadius: '4px',
                textTransform: 'none',
                boxShadow: 'none',
                ...buttonStyle,
                '&:disabled': {
                    backgroundColor: '#ccc',
                    color: '#666',
                },
                ...sx,
            }}
            {...props}
        >
            {children}
        </Button>
    );
}

export default ActionButton;
