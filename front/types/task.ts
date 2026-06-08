export type TaskStatus = 'processing' | 'completed' | 'failed';

export interface TaskProgress {
  task_id: string;
  status: TaskStatus;
  progress: number;
  message: string;
  step?: number;
  total_steps?: number;
}
