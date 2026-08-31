import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { publicApi } from '@/lib/api/publicApi';
import type { FeatureFlags } from '@/types/featureFlags';

/**
 * BFF: 기능 플래그 조회 — **인증 없이** 호출된다.
 *
 * 앱이 시작될 때(로그인 전, 랜딩·로그인 화면 포함) 호출되므로 proxyToBackend 를 쓸 수
 * 없다. 그쪽은 세션이 없으면 401 로 끊는다. 백엔드의 /api/settings/flags 도 같은 이유로
 * 의도적으로 공개 엔드포인트다.
 *
 * 그래도 BFF 를 거치는 이유: 예전에는 브라우저가 NEXT_PUBLIC_API_URL 로 FastAPI 를 직접
 * 불렀는데, 그 값 하나 때문에 백엔드 주소가 클라이언트 번들에 실려 나갔다. 이 라우트가
 * 마지막 직접 호출을 없애서 브라우저는 더 이상 백엔드 주소를 모른다.
 *
 * 조회에 실패하면 빈 객체를 준다 — 플래그를 모르면 전부 활성으로 보는 게 기본 동작이라
 * (useFeatureFlagStore.isEnabled) 앱이 멈추는 대신 그대로 열린 상태로 뜬다.
 */
export async function GET() {
  try {
    const { data } = await publicApi.get<FeatureFlags>('/api/settings/flags');
    return NextResponse.json(data);
  } catch (err) {
    const status = isAxiosError(err) && err.response ? err.response.status : 502;
    return NextResponse.json({}, { status });
  }
}
