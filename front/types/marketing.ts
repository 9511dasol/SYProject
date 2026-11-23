/** SA 광고 대시보드 — 응답 타입은 백엔드 OpenAPI 에서 생성된 것을 가리킨다.
 *
 *  예전에는 이 구조를 손으로 적어 두었고, 백엔드가 키를 바꿔도 화면은 모른 채
 *  빈 값으로 그려졌다. 이제 어긋나면 타입 검사에서 먼저 걸린다.
 */

import type { components } from '@/types/api.generated';

type S = components['schemas'];

// ── 엑셀 리포트 (업로드/불러오기) ─────────────────────────────────────────────
export type BudgetRow = S['BudgetRow'];
export type DailyTotalRow = S['DailyTotalRow'];
export type MediaSheetData = S['MediaSheetData'];
export type SaTotalRow = S['SaTotalRow'];
export type SaTotal = S['SaTotal'];
export type ExcelReport = S['ExcelReport'];
export type ExcelReportBundle = S['ExcelReportBundle'];
export type ExcelPeriodSummary = S['ExcelPeriodSummary'];

// ── 집계 결과 (대시보드) ──────────────────────────────────────────────────────
export type MediaDailyRow = S['MediaDailyRow'];
export type MediaSummary = S['MediaSummary'];
export type RowDiff = S['RowDiff'];
export type ComparePeriod = S['ComparePeriod'];
export type ReportData = S['ReportResponse'];

// ── 행 직접 입력/수정 ─────────────────────────────────────────────────────────
export type RowFormData = S['RowUpsertBody'];
