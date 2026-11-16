/**
 * `/automation` 랜딩 — 광고 상담 접수 설정.
 *
 * 문의는 구글 폼 임베드로 받는다. 서버도 DB 도 필요 없고 응답이 스프레드시트에
 * 쌓이므로, 리드가 하루 몇 건인 초기 단계에는 자체 폼보다 이쪽이 싸게 먹힌다.
 *
 * 세 값 모두 `NEXT_PUBLIC_` 접두사가 필요하다 — 브라우저에서 UTM 을 읽어
 * iframe 주소를 조립하기 때문이다. 빌드 시점에 번들에 박히므로, 값을 바꾸면
 * 다시 배포해야 반영된다.
 */

/** 구글 폼 "보내기 → 링크" 주소. 끝이 `/viewform` 인 쪽을 쓴다. */
export const LEAD_FORM_URL = process.env.NEXT_PUBLIC_LEAD_FORM_URL ?? '';

/**
 * 유입 경로(UTM)를 담을 단답형 질문의 entry ID — 숫자만.
 *
 * 구글 폼 → `⋮ → 미리 채워진 링크 가져오기` → 그 질문에 아무 값이나 넣고 링크 복사
 * → 주소에 보이는 `entry.1234567890` 의 숫자 부분. 비워 두면 UTM 은 전달되지 않고
 * 폼만 정상으로 뜬다.
 */
export const LEAD_FORM_UTM_ENTRY = process.env.NEXT_PUBLIC_LEAD_FORM_UTM_ENTRY ?? '';

/** 폼이 아직 연결되지 않았을 때 대신 보여 줄 연락처. 비워 두면 안내 문구만 나온다. */
export const LEAD_CONTACT_EMAIL = process.env.NEXT_PUBLIC_LEAD_CONTACT_EMAIL ?? '';

/**
 * 링크 미리보기(og:image)에 쓸 절대 주소의 뿌리.
 *
 * Next 는 `metadataBase` 없이 상대 경로 og:image 를 쓰면 **빌드를 실패시킨다.**
 * 배포 도메인이 정해지면 `NEXT_PUBLIC_SITE_URL` 을 채운다. 로컬 기본값으로는
 * 미리보기 썸네일이 안 뜨지만 빌드는 통과한다.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * 구글 폼에 실어 보낼 쿼리 파라미터. Meta 광고의 "URL 매개변수" 칸과 이름을 맞춘다.
 * 여기 없는 파라미터는 버린다 — 임의의 쿼리스트링을 그대로 폼에 넣지 않기 위해서다.
 */
export const TRACKED_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_placement',
  'utm_site',
  'fbclid',
] as const;
