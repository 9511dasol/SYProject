'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * 모션 최소화 설정 구독.
 * 이펙트 안에서 matchMedia 를 읽고 setState 하면 렌더가 연쇄로 돌기 때문에
 * 외부 상태 구독에 맞는 useSyncExternalStore 로 읽는다.
 * 서버에서는 false(애니메이션 켠 상태)로 렌더해 하이드레이션을 맞춘다.
 */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
