/**
 * 유휴 시간 관리 유틸리티
 *
 * 사용자의 마지막 활동 시각을 localStorage에 저장하고,
 * 15분 이상 미활동 여부를 판단한다.
 */

/** 유휴 타임아웃: 15분 (밀리초) */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** localStorage 키: 마지막 활동 시각 */
export const LAST_ACTIVITY_KEY = 'lastActivityTime';

/**
 * 현재 유휴 상태인지 확인한다.
 * localStorage의 lastActivityTime과 현재 시각을 비교하여
 * IDLE_TIMEOUT_MS 이상 경과했으면 true를 반환한다.
 *
 * @returns {boolean} 15분 이상 미활동이면 true
 */
export function isUserIdle() {
  const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!lastActivity) return true;
  return (Date.now() - Number(lastActivity)) > IDLE_TIMEOUT_MS;
}
