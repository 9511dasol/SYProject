import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** 연·월이 path 파라미터라 GET·PUT이 같은 경로를 만든다. */
function budgetsPath(year: string, month: string): string {
  return `/api/admin/periods/${encodeURIComponent(year)}/${encodeURIComponent(month)}/budgets`;
}

/** BFF: 엑셀 summary '■ 매체별 예산'에 채울 값을 조회한다. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ year: string; month: string }> },
) {
  const { year, month } = await params;
  return proxyToBackend(request, { backendPath: budgetsPath(year, month) });
}

/** BFF: 해당 연월의 매체별 예산을 통째로 교체한다. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ year: string; month: string }> },
) {
  const { year, month } = await params;
  return proxyToBackend(request, { backendPath: budgetsPath(year, month) });
}
