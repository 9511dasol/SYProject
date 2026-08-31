import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 관리자가 계정을 활성 · 비활성으로 전환한다. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/admin/users/${encodeURIComponent(id)}/active`,
  });
}
