import type { FeatureFlags } from '@/types/featureFlags';

/**
 * 기능 플래그 조회.
 *
 * 예전에는 NEXT_PUBLIC_API_URL 로 FastAPI 를 직접 불렀는데, 그 값 하나 때문에 백엔드
 * 주소가 클라이언트 번들에 실려 나갔다. 지금은 같은 오리진의 BFF 라우트를 부르므로
 * 브라우저는 백엔드 주소를 모른다.
 *
 * authFetch 를 쓰지 않는 이유: 이 호출은 로그인 전에도 일어난다. authFetch 는 401 을
 * 만나면 자동 로그아웃시키므로 랜딩·로그인 화면에서 부작용이 생긴다.
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const res = await fetch('/api/settings/flags', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`기능 플래그 조회 실패: ${res.status}`);
  }
  return res.json() as Promise<FeatureFlags>;
}
