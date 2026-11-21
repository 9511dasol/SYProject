/**
 * 이미지 업로드 공통 제약.
 *
 * 허용 포맷·용량 상한·거부 문구가 리사이저 드롭존과 이미지 정제 화면에
 * 각자 복제돼 있었다 — 한쪽만 바꾸면 두 화면이 서로 다른 파일을 거부한다.
 */

export const ACCEPTED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

/** 안내 문구용 포맷 나열 — 검증 Set 과 함께 수정해야 한다는 걸 같은 파일로 묶는다 */
export const ACCEPTED_IMAGE_LABEL = 'JPEG · PNG · WebP · GIF · BMP';

/** 업로드 가능한 이미지인지 검사한다. 문제가 없으면 null, 있으면 표시할 메시지. */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_MIME.has(file.type)) return `${ACCEPTED_IMAGE_LABEL} 파일만 지원됩니다.`;
  if (file.size > MAX_IMAGE_BYTES) return '파일 크기는 50MB 이하여야 합니다.';
  return null;
}
