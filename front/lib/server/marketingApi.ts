import axios, { isAxiosError } from 'axios';
import type { TaskStatusResponse } from '@/types/marketing';

const serverApi = axios.create({
  baseURL: process.env.API_URL ?? 'http://localhost:8000',
});

export async function fetchTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  try {
    const { data } = await serverApi.get<TaskStatusResponse>(
      `/api/marketing/status/${taskId}`
    );
    return data;
  } catch (err) {
    if (isAxiosError(err)) {
      throw new Error(
        err.response?.data?.detail ?? `태스크 상태 조회 실패: ${err.response?.status}`
      );
    }
    throw err;
  }
}
