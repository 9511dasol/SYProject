import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 보관된 편집 결과 이미지 한 장 (binary 패스스루). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const { id, index } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/image-filter/history/${encodeURIComponent(id)}/images/${encodeURIComponent(index)}`,
    binary: true,
  });
}
