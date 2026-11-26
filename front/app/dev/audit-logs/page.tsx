import type { Metadata } from 'next';
import DevAuditLogsClient from '@/app/dev/audit-logs/DevAuditLogsClient';
import DevGate from '@/components/ui/DevGate';

export const metadata: Metadata = {
  title: '감사 로그',
  description: '운영 행위 전수 기록 — 누가 언제 무엇을 했는지',
};

export default function DevAuditLogsPage() {
  return (
    <DevGate>
      <DevAuditLogsClient />
    </DevGate>
  );
}
