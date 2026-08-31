/** 업로드 파일 종류 판별 — CSV 여러 개, 또는 XLSX 한 개 */

export type UploadKind = 'csv' | 'xlsx';

export const CSV_EXT = /\.csv$/i;
export const XLSX_EXT = /\.xlsx$/i;

const PERIOD_LABEL = /(\d{2,4})\s*년\s*(\d{1,2})\s*월/;

/**
 * 파일 묶음의 종류. 섞여 있거나 xlsx 가 여러 개면 null —
 * 두 흐름은 서버 엔드포인트도 저장 방식도 달라서 함께 처리할 수 없다.
 */
export function kindOf(files: File[]): UploadKind | null {
  if (files.length === 0) return null;
  if (files.every((f) => CSV_EXT.test(f.name))) return 'csv';
  if (files.length === 1 && XLSX_EXT.test(files[0].name)) return 'xlsx';
  return null;
}

/** "26년 5월" → {year: 2026, month: 5}. DB 기간 목록과 맞춰 보기 위한 것. */
export function parsePeriodLabel(label: string): { year: number; month: number } | null {
  const m = PERIOD_LABEL.exec(label);
  if (!m) return null;
  const year = Number(m[1]);
  return { year: year < 100 ? 2000 + year : year, month: Number(m[2]) };
}
