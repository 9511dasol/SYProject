import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 관리자 페이지에서 기능 플래그를 켜고 끈다. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/admin/settings/${encodeURIComponent(key)}`,
  });
}
