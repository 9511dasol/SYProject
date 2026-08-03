export const queryKeys = {
  periods: () => ['periods'] as const,
  summary: (year: number, month: number) => ['summary', year, month] as const,
  /** 모든 기간의 summary 를 한 번에 무효화하는 접두 키.
   *  업로드 핸들러는 어느 달이 들어왔는지 모르므로(파일 안의 기간을 서버가 정한다)
   *  기간을 짚어 무효화할 수 없다. */
  allSummaries: () => ['summary'] as const,
  taskStatus: (taskId: string) => ['taskStatus', taskId] as const,
  saveTask: (taskId: string) => ['saveTask', taskId] as const,
  exportTask: (taskId: string) => ['exportTask', taskId] as const,
  reportLogs: () => ['reportLogs'] as const,
} as const;
