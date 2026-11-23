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
  /**
   * 헤더 알림 센터가 쓰는 최근 발송 실패 — 목록 화면과 같은 엔드포인트지만
   * limit 이 달라 응답 모양이 다르다. 키를 섞으면 서로의 캐시를 덮어쓴다.
   */
  adminRecentSendFailures: () => ['admin', 'alerts', 'sendFailures'] as const,

  /** 프로필 (내 정보) */
  me: () => ['me'] as const,

  /** 헤딩 문구 기록 */
  headingHistory: () => ['headingHistory'] as const,

  /** 키워드 순위 모니터링 */
  rankWatches: () => ['rankWatches'] as const,
  rankWatchHistory: (id: number) => ['rankWatches', id, 'history'] as const,
  rankWatchAlerts: (id: number) => ['rankWatches', id, 'alerts'] as const,
  /** 예상 입찰가는 일부러 'rankWatches' 밖에 둔다 — 순위를 수집해도 시장 입찰가가
   *  달라지는 건 아니라서, 목록 무효화에 휩쓸려 외부 API 를 다시 부르면 낭비다 */
  rankWatchBids: (id: number) => ['rankBids', id] as const,
  /** 경쟁 지표는 월 단위로 바뀌는 값이라 입찰가보다도 오래 들고 있어도 된다 */
  rankWatchInsight: (id: number) => ['rankInsight', id] as const,
  rankCollectStatus: () => ['rankCollectStatus'] as const,
  /** 목록과 모든 이력을 한 번에 무효화하는 접두 키 — 업로드는 어느 감시가 갱신됐는지 모른다 */
  allRankWatches: () => ['rankWatches'] as const,
} as const;
