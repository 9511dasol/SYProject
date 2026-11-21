import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 순위 이력 조회 (그래프용 날짜 오름차순). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/rank-monitor/watches/${encodeURIComponent(id)}/history`,
  });
}
