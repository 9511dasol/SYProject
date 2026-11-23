import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 순위별 예상 입찰가 조회. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/rank-monitor/watches/${encodeURIComponent(id)}/bid-estimate`,
  });
}
