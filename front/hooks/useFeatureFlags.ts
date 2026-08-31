'use client';

import { useQuery } from '@tanstack/react-query';
import { getFeatureFlags } from '@/lib/featureFlagClient';
import { queryKeys } from '@/lib/queryKeys';
import type { FeatureFlags } from '@/types/featureFlags';

/**
 * 기능 플래그.
 *
 * 예전에는 zustand 스토어에 담았는데, react-query 트리 안에 있으면서도 캐시·재시도·
 * 무효화를 하나도 못 쓰는 구조였다. 특히 관리자가 /admin/settings 에서 플래그를 토글해도
 * 그 스토어를 갱신할 경로가 없어서, 새로고침하지 않으면 화면이 예전 상태로 남았다.
 *
 * 같은 쿼리 키를 쓰므로 여러 컴포넌트가 불러도 요청은 한 번만 나간다.
 */
export function useFeatureFlags() {
  return useQuery({
    queryKey: queryKeys.featureFlags(),
    queryFn: getFeatureFlags,
    // 플래그는 자주 바뀌지 않는다. 바뀌는 시점(관리자 토글)에는 명시적으로 무효화한다.
    staleTime: 5 * 60_000,
    // 조회에 실패하면 전부 활성으로 본다(아래 isEnabled) — 앱을 막지 않는다
    retry: 1,
  });
}

/**
 * 플래그 하나가 켜져 있는지. 아직 못 불러왔거나 키가 없으면 **활성**으로 본다 —
 * 플래그 조회 실패가 기능 차단으로 번지지 않게 하기 위한 기본값이다.
 */
export function useFeatureEnabled(key: string): boolean {
  const { data } = useFeatureFlags();
  return (data as FeatureFlags | undefined)?.[key] ?? true;
}
