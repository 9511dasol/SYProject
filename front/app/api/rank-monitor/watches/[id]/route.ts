import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 감시 설정 부분 수정. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, { backendPath: `/api/rank-monitor/watches/${encodeURIComponent(id)}` });
}

/** BFF: 감시와 순위 이력 삭제. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, { backendPath: `/api/rank-monitor/watches/${encodeURIComponent(id)}` });
}
