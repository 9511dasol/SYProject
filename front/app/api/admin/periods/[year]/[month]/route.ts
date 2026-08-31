import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 관리자 페이지에서 해당 연월의 데이터·코멘트·엑셀 원본을 모두 삭제한다. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ year: string; month: string }> },
) {
  const { year, month } = await params;
  return proxyToBackend(request, {
    backendPath: `/api/admin/periods/${encodeURIComponent(year)}/${encodeURIComponent(month)}`,
  });
}
