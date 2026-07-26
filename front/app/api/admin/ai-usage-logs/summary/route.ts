import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { AIUsageSummary } from '@/types/aiUsageLog';

/** BFF: 이번 달 AI 도구(Gemini) 토큰 사용량 합계 + 관리자가 설정한 월간 예산을 조회한다. */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { data } = await privateApi.get<AIUsageSummary>('/api/admin/ai-usage-logs/summary');
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '사용량 요약 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
