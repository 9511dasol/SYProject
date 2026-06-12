'use client';

import { useEffect } from 'react';
import { getFeatureFlags } from '@/lib/featureFlagClient';
import { useFeatureFlagStore } from '@/lib/store/useFeatureFlagStore';

/** 앱 시작 시 기능 플래그를 조회해 zustand store에 채워 넣는다. */
export default function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const setFlags = useFeatureFlagStore((state) => state.setFlags);

  useEffect(() => {
    getFeatureFlags()
      .then(setFlags)
      .catch(() => {
        // 조회 실패 시 모든 기능을 활성 상태로 두고 넘어간다
      });
  }, [setFlags]);

  return <>{children}</>;
}
