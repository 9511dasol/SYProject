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

/** 업로드 패널의 파일 선택 상태 — 고른 파일과, 있다면 그 이유를 설명하는 문구 */
export interface Selection {
  files: File[];
  error: string | null;
}

const listNames = (files: File[]) => files.map((f) => f.name).join(', ');

/**
 * 새로 고른 파일을 지금 선택에 합쳐 다음 선택을 만든다. 규칙을 어기면 선택은 그대로 두고
 * error 만 채운다.
 *
 * 파일이 들어오는 길이 셋(드롭존 · "CSV 파일 추가" · 홈 카드에 떨구기)인데 예전에는
 * 홈 카드 경로만 검사를 건너뛰고 상태로 바로 들어갔다. 그래서 .pdf 나 xlsx 두 개를
 * 카드에 떨구면 kindOf() 가 null 이 되어 CSV·Excel 흐름 둘 다 렌더되지 않고, 안내
 * 문구조차 없는 빈 화면에 갇혔다. 셋 다 이 함수를 거치게 해서 그 구멍을 막는다.
 *
 * 순수 함수라 setState 업데이터 안에서 그대로 부를 수 있다 — StrictMode 가 업데이터를
 * 두 번 실행해도 결과가 같고, 파일과 에러가 한 상태에 묶여 있어 서로 어긋나지 않는다.
 */
export function selectFiles(current: File[], incoming: File[]): Selection {
  if (incoming.length === 0) return { files: current, error: null };

  const csvs = incoming.filter((f) => CSV_EXT.test(f.name));
  const excels = incoming.filter((f) => XLSX_EXT.test(f.name));
  const skipped = incoming.filter((f) => !CSV_EXT.test(f.name) && !XLSX_EXT.test(f.name));

  // 섞여 들어오면 한쪽을 조용히 버리지 않고 되묻는다 — 예전에는 첫 파일의 종류만 보고
  // 나머지를 말없이 지워서, 같이 끌어다 놓은 파일이 사라진 것처럼 보였다.
  if (csvs.length > 0 && excels.length > 0) {
    return { files: current, error: 'CSV 와 Excel 은 함께 올릴 수 없습니다. 한 종류씩 올려 주세요.' };
  }
  if (excels.length > 1) {
    return {
      files: current,
      error: `엑셀 리포트는 한 번에 한 개만 올릴 수 있습니다 (${excels.length}개를 고르셨습니다).`,
    };
  }
  if (csvs.length === 0 && excels.length === 0) {
    return {
      files: current,
      error: `${listNames(skipped)} — .csv 또는 .xlsx 파일만 올릴 수 있습니다.`,
    };
  }

  // 엑셀은 통째로 교체, CSV 는 이어 붙이되 같은 파일은 한 번만 남긴다
  const files =
    excels.length === 1
      ? excels
      : [...current.filter((f) => CSV_EXT.test(f.name)), ...csvs].filter(
          (f, i, all) => all.findIndex((o) => o.name === f.name && o.size === f.size) === i,
        );

  return {
    files,
    error:
      skipped.length > 0
        ? `${listNames(skipped)} 은(는) 건너뛰었습니다 — .csv 또는 .xlsx 만 올릴 수 있습니다.`
        : null,
  };
}

/** "26년 5월" → {year: 2026, month: 5}. DB 기간 목록과 맞춰 보기 위한 것. */
export function parsePeriodLabel(label: string): { year: number; month: number } | null {
  const m = PERIOD_LABEL.exec(label);
  if (!m) return null;
  const year = Number(m[1]);
  return { year: year < 100 ? 2000 + year : year, month: Number(m[2]) };
}
