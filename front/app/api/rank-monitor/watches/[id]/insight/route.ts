import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 키워드 경쟁 지표 (검색량·경쟁정도·평균 노출 광고 수). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/rank-monitor/watches/${encodeURIComponent(id)}/insight`,
  });
}
