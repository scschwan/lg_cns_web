/**
 * JWT 토큰 클라이언트 측 유틸리티
 * - 서버 요청 없이 토큰 만료 여부를 즉시 판단
 */

/**
 * JWT 페이로드를 디코딩한다 (서명 검증 없이 페이로드만 추출)
 * @param {string} token - JWT 토큰 문자열
 * @returns {object|null} 디코딩된 페이로드 또는 null
 */
export function decodeJwtPayload(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Base64URL → Base64 변환 후 디코딩
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return payload;
  } catch {
    return null;
  }
}

/**
 * JWT 토큰이 만료되었는지 확인한다
 * @param {string} token - JWT 토큰 문자열
 * @param {number} bufferSeconds - 만료 전 여유 시간(초). 기본 30초
 * @returns {boolean} 만료되었으면 true
 */
export function isTokenExpired(token, bufferSeconds = 30) {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true; // 디코딩 실패 또는 exp 없으면 만료로 간주

  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now + bufferSeconds;
}

/**
 * localStorage의 authToken이 만료되었는지 확인한다
 * @returns {boolean} 만료되었으면 true, 토큰 없으면 true
 */
export function isAuthTokenExpired() {
  const token = localStorage.getItem('authToken');
  if (!token || token === 'undefined' || token === 'null') return true;
  return isTokenExpired(token);
}

/**
 * localStorage의 refreshToken이 만료되었는지 확인한다
 * @returns {boolean} 만료되었으면 true, 토큰 없으면 true
 */
export function isRefreshTokenExpired() {
  const token = localStorage.getItem('refreshToken');
  if (!token || token === 'undefined' || token === 'null') return true;
  return isTokenExpired(token);
}
