'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';

/**
 * 앱 시작 시 기능 플래그를 한 번 받아 캐시를 채운다.
 *
 * 값을 직접 들고 있지 않다 — 캐시는 react-query 가 갖고 있고, 읽는 쪽은
 * FeatureGate 가 같은 쿼리 키로 조회한다. 이 컴포넌트의 역할은 "화면이 그려지기 전에
 * 미리 한 번 요청을 띄워 두는 것"뿐이다.
 */
export default function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  useFeatureFlags();
  return <>{children}</>;
}
