import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 이미지 편집 기록 한 건 삭제 (스토리지 객체 포함). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/image-filter/history/${encodeURIComponent(id)}`,
  });
}
