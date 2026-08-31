import type { Metadata } from 'next';
import AdminAiUsageLogsClient from '@/app/admin/ai-usage-logs/AdminAiUsageLogsClient';
import AdminGate from '@/components/ui/AdminGate';

export const metadata: Metadata = {
  title: 'AI 도구 사용 이력',
  description: '이미지 정제 · 리사이저 AI 업스케일 · 헤딩 문구 추천 사용 이력 조회',
};

export default function AdminAiUsageLogsPage() {
  return (
    <AdminGate>
      <AdminAiUsageLogsClient />
    </AdminGate>
  );
}
