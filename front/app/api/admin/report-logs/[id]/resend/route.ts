import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 실패한 리포트 메일 발송 건을 같은 조건으로 재시도한다. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/admin/report-logs/${encodeURIComponent(id)}/resend`,
  });
}
