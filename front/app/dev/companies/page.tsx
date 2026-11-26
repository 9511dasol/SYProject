import type { Metadata } from 'next';
import DevCompaniesClient from '@/app/dev/companies/DevCompaniesClient';
import DevGate from '@/components/ui/DevGate';

export const metadata: Metadata = {
  title: '기업 · 체험 관리',
  description: '기업 생성·정지, admin 발급, 토큰 예산, 체험 계정 발급·연장',
};

export default function DevCompaniesPage() {
  return (
    <DevGate>
      <DevCompaniesClient />
    </DevGate>
  );
}
