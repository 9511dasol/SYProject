import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/server/bffProxy';

/** BFF: 키워드 보고서(CSV/Excel) 업로드 → 해당 날짜 순위 스냅샷 적재. */
export async function POST(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/rank-monitor/snapshots/upload' });
}
