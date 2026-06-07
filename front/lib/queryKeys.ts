export const queryKeys = {
  periods: () => ['periods'] as const,
  summary: (year: number, month: number) => ['summary', year, month] as const,
  taskStatus: (taskId: string) => ['taskStatus', taskId] as const,
  saveTask: (taskId: string) => ['saveTask', taskId] as const,
  exportTask: (taskId: string) => ['exportTask', taskId] as const,
} as const;
