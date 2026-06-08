import type { TaskProgress } from '@/types/task';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function fetchTaskStatus(taskId: string): Promise<TaskProgress> {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/status`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`태스크 상태 조회 실패: ${res.status}`);
  }
  return res.json() as Promise<TaskProgress>;
}
