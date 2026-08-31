import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 관리자가 다른 계정의 이름 · 이메일을 수정한다. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/admin/users/${encodeURIComponent(id)}/profile`,
  });
}
