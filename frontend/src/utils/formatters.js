// frontend/src/utils/formatters.js

/**
 * 숫자를 콤마 포함 문자열로 변환
 * @param {number} value - 숫자 값
 * @returns {string} - 콤마 포함 문자열 (예: 1,500,000)
 */
export const formatNumber = (value) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('ko-KR');
};

/**
 * 금액을 단위별로 변환
 * @param {number} value - 금액 (원 단위)
 * @param {string} unit - 단위 ('원', '천원', '백만원', '억원')
 * @returns {string} - 변환된 금액 문자열
 */
export const formatCurrency = (value, unit = '원') => {
    if (value === null || value === undefined) return '-';

    let converted = value;
    let suffix = '원';

    switch (unit) {
        case '천원':
            converted = value / 1000;
            suffix = '천원';
            break;
        case '백만원':
            converted = value / 1000000;
            suffix = '백만원';
            break;
        case '억원':
            converted = value / 100000000;
            suffix = '억원';
            break;
        default:
            suffix = '원';
    }

    return `${formatNumber(Math.round(converted))} ${suffix}`;
};

/**
 * 날짜를 한국어 포맷으로 변환
 * @param {Date|string} date - 날짜 객체 또는 문자열
 * @param {boolean} includeTime - 시간 포함 여부
 * @returns {string} - 포맷된 날짜 문자열
 */
export const formatDate = (date, includeTime = false) => {
    if (!date) return '-';

    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';

    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };

    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }

    return d.toLocaleDateString('ko-KR', options);
};

/**
 * 파일 크기를 읽기 쉬운 형태로 변환
 * @param {number} bytes - 바이트 단위 크기
 * @returns {string} - 변환된 크기 문자열 (예: 1.5 MB)
 */
export const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 백분율 포맷
 * @param {number} value - 0~1 사이 값 또는 0~100 사이 값
 * @param {boolean} isDecimal - true면 0~1, false면 0~100
 * @returns {string} - 백분율 문자열
 */
export const formatPercent = (value, isDecimal = true) => {
    if (value === null || value === undefined) return '-';

    const percent = isDecimal ? value * 100 : value;
    return `${percent.toFixed(1)}%`;
};
