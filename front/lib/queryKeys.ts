/**
 * 모든 TanStack Query 키를 여기 모은다.
 * 컴포넌트에 문자열을 직접 쓰면 무효화(invalidateQueries) 대상에서 조용히 누락된다.
 */
export const queryKeys = {
  periods: () => ['periods'] as const,
  summary: (year: number, month: number) => ['summary', year, month] as const,
  /** 모든 기간의 summary 를 한 번에 무효화하는 접두 키.
   *  업로드 핸들러는 어느 달이 들어왔는지 모르므로(파일 안의 기간을 서버가 정한다)
   *  기간을 짚어 무효화할 수 없다. */
  allSummaries: () => ['summary'] as const,
  saveTask: (taskId: string) => ['saveTask', taskId] as const,
  exportTask: (taskId: string) => ['exportTask', taskId] as const,
  reportLogs: () => ['reportLogs'] as const,

  /** 기능 플래그 — 앱 시작 시 한 번 받고, 관리자가 토글하면 무효화한다 */
  featureFlags: () => ['featureFlags'] as const,

  // ── 관리자 화면 ────────────────────────────────────────────────────────────
  adminUsers: () => ['admin', 'users'] as const,
  adminSettings: () => ['admin', 'settings'] as const,
  adminAiStatus: () => ['admin', 'aiStatus'] as const,
  adminPeriods: () => ['admin', 'periods'] as const,
  adminMediaBudgets: (year: number, month: number) =>
    ['admin', 'mediaBudgets', year, month] as const,
  adminAiUsageSummary: () => ['admin', 'aiUsage', 'summary'] as const,
  adminAiUsageLogs: (tool: string, offset: number) =>
    ['admin', 'aiUsage', 'logs', tool, offset] as const,
  adminReportLogs: (status: string, offset: number) =>
    ['admin', 'reportLogs', status, offset] as const,
  /** 필터·페이지가 다른 목록까지 한 번에 무효화하는 접두 키 */
  allAdminReportLogs: () => ['admin', 'reportLogs'] as const,

  /** 프로필 (내 정보) */
  me: () => ['me'] as const,

  /** 헤딩 문구 기록 */
  headingHistory: () => ['headingHistory'] as const,
} as const;
