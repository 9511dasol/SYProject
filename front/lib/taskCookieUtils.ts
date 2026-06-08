import Cookies from 'js-cookie';

export const TASK_ID_COOKIE = 'bg_task_id';

export function getTaskIdFromCookie(): string | null {
  return Cookies.get(TASK_ID_COOKIE) ?? null;
}

export function setTaskIdCookie(taskId: string): void {
  Cookies.set(TASK_ID_COOKIE, taskId, {
    expires: 1,
    sameSite: 'lax',
  });
}

export function clearTaskIdCookie(): void {
  Cookies.remove(TASK_ID_COOKIE);
}

/**
 * 백그라운드 작업 시작 - 쿠키 저장 + 위젯에 커스텀 이벤트 전송
 * 이미지 처리 등 각 기능 컴포넌트에서 호출
 */
export function startBackgroundTask(taskId: string): void {
  setTaskIdCookie(taskId);
  window.dispatchEvent(
    new CustomEvent<{ taskId: string }>('task-started', { detail: { taskId } })
  );
}
