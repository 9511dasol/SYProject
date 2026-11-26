import type { Metadata } from 'next';
import DevSettingsClient from '@/app/dev/settings/DevSettingsClient';
import DevGate from '@/components/ui/DevGate';

export const metadata: Metadata = {
  title: '기능 플래그 관리',
  description: '전 기업에 적용되는 기능 플래그와 AI 프로바이더 현황 (dev 전용)',
};

export default function DevSettingsPage() {
  return (
    <DevGate>
      <DevSettingsClient />
    </DevGate>
  );
}
