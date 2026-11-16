/**
 * 브라우저 다운로드 트리거.
 *
 * "Content-Disposition 에서 파일명 뽑기 → objectURL 만들기 → 보이지 않는 <a> 를
 * 붙였다 클릭하고 떼기 → revoke" 절차가 클라이언트 4곳에 복제돼 있었다.
 * revoke 를 빠뜨리면 그대로 메모리 누수라 한 곳에서만 관리한다.
 */

const FILENAME_PATTERN = /filename[^;=\n]*=\s*(?:UTF-8''|"?)([^";\n]*)"?/i;

/** 응답 헤더의 파일명. 없거나 못 읽으면 fallback. */
export function filenameFromDisposition(res: Response, fallback: string): string {
  const header = res.headers.get('Content-Disposition') ?? '';
  const matched = header.match(FILENAME_PATTERN)?.[1];
  if (!matched) return fallback;

  try {
    return decodeURIComponent(matched);
  } catch {
    // 서버가 퍼센트 인코딩을 하지 않았으면 그대로 쓴다
    return matched;
  }
}

/** Blob 을 파일로 내려받게 한다. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** 응답 본문을 파일명까지 맞춰 그대로 내려받는다. */
export async function downloadResponse(res: Response, fallbackName: string): Promise<void> {
  triggerDownload(await res.blob(), filenameFromDisposition(res, fallbackName));
}
