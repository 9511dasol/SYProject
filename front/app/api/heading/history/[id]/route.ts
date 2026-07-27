import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 헤딩 문구 생성 기록 한 건 삭제. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, { backendPath: `/api/heading/history/${encodeURIComponent(id)}` });
}
