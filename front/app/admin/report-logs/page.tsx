import type { Metadata } from 'next';
import AdminReportLogsClient from '@/app/admin/report-logs/AdminReportLogsClient';

export const metadata: Metadata = {
  title: '리포트 발송 로그',
  description: '리포트 메일 발송 이력 조회 및 실패 건 재발송',
};

export default function AdminReportLogsPage() {
  return <AdminReportLogsClient />;
}
