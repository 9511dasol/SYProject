'use client';

import type { ReactNode } from 'react';
import MaintenanceNotice from '@/components/ui/MaintenanceNotice';
import { useFeatureEnabled } from '@/hooks/useFeatureFlags';

interface FeatureGateProps {
  /** system_settings 테이블의 기능 플래그 키 (예: 'is_dashboard_enabled') */
  flag: string;
  title?: string;
  children: ReactNode;
}

/** 기능 플래그가 꺼져 있으면 children 대신 점검 안내를 표시한다. */
export default function FeatureGate({ flag, title, children }: FeatureGateProps) {
  const enabled = useFeatureEnabled(flag);

  if (!enabled) {
    return <MaintenanceNotice title={title} />;
  }

  return <>{children}</>;
}
