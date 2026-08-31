/**
 * 화면 표시용 포맷 함수 모음.
 *
 * 같은 일을 하는 함수가 파일마다 이름만 바꿔 흩어져 있었다 —
 * 날짜+시각 포맷터만 6개(formatDate · formatDateTime · formatUpdatedAt · fmtDate …),
 * 숫자 포맷터가 4개였다. 한 곳에서만 고치면 전부 반영되도록 여기로 모은다.
 *
 * 로케일은 전부 'ko-KR' 고정이다. 인자를 빼면 브라우저 로케일을 따라가서
 * 같은 화면의 숫자 서식이 사용자마다 달라진다.
 */

const LOCALE = 'ko-KR';

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

// ── 날짜 ──────────────────────────────────────────────────────────────────────

/**
 * ISO 문자열 → "2026. 08. 31. 14:20".
 * 파싱에 실패하면 fallback을 돌려준다 — 예전 구현 일부가 그대로 두면
 * 화면에 "Invalid Date"를 뿌렸다.
 */
export function formatDateTime(
  value: string | null | undefined,
  fallback = '-',
): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(LOCALE, DATE_TIME_OPTIONS);
}

/** ISO 문자열 → "2026. 08. 31." (시각 없음) */
export function formatDate(
  value: string | null | undefined,
  fallback = '-',
): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(LOCALE, DATE_OPTIONS);
}

// ── 숫자 ──────────────────────────────────────────────────────────────────────

/** 반올림한 정수에 천 단위 구분 — 노출·클릭 등 지표 기본형 */
export function formatNumber(
  value: number | null | undefined,
  fallback = '-',
): string {
  if (value == null || Number.isNaN(value)) return fallback;
  return Math.round(value).toLocaleString(LOCALE);
}

/** 반올림 없이 천 단위 구분 — 건수·토큰 수처럼 이미 정수인 값 */
export function formatCount(
  value: number | null | undefined,
  fallback = '-',
): string {
  if (value == null || Number.isNaN(value)) return fallback;
  return value.toLocaleString(LOCALE);
}

/** 소수 자릿수 고정 — 전환수처럼 소수점이 의미 있는 값 */
export function formatDecimal(
  value: number | null | undefined,
  digits = 1,
  fallback = '-',
): string {
  if (value == null || Number.isNaN(value)) return fallback;
  return value.toFixed(digits);
}

/** 원화 표기. 0을 '-'로 감추고 싶으면 호출부에서 따로 처리한다 */
export function formatWon(
  value: number | null | undefined,
  fallback = '-',
): string {
  if (value == null || Number.isNaN(value)) return fallback;
  return `${Math.round(value).toLocaleString(LOCALE)}원`;
}

/**
 * 비율(0~1) → "12.34%".
 * 이미 퍼센트 단위인 값에는 쓰지 말 것 — 100배가 된다.
 */
export function formatPercent(
  value: number | null | undefined,
  digits = 2,
  fallback = '-',
): string {
  if (value == null || Number.isNaN(value)) return fallback;
  return `${(value * 100).toFixed(digits)}%`;
}

/** 큰 금액을 "1.2억" · "3.4만"으로 줄여 표기 — 카드처럼 폭이 좁은 자리용 */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(1)}만`;
  return formatNumber(value);
}

/** 증감값에 부호를 붙인다. 0은 기호(−)로 — 증감 없음과 실제 0을 구분한다 */
export function formatSigned(value: number): string {
  if (value === 0) return '−';
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

/** 증감률. 이전 값이 0이면 계산이 불가능하므로 null (호출부에서 '신규' 등으로 표시) */
export function formatPercentChange(curr: number, prev: number): string | null {
  if (prev === 0) return null;
  const p = ((curr - prev) / prev) * 100;
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
}

// ── 기타 ──────────────────────────────────────────────────────────────────────

/** 바이트 → "1.2 MB" · "340 KB" */
export function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}
