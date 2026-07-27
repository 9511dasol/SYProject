import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 헤딩 기록에 저장된 썸네일 이미지를 그대로(바이너리) 전달. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/heading/history/${encodeURIComponent(id)}/image`,
    binary: true,
  });
}
