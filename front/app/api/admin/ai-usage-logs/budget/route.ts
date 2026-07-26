import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { AIUsageSummary } from '@/types/aiUsageLog';

/** BFF: 관리자가 AI 도구(Gemini) 월간 토큰 예산(내부 참고용 목표치)을 설정한다. */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const body = await request.json();

  try {
    const { data } = await privateApi.patch<AIUsageSummary>('/api/admin/ai-usage-logs/budget', body);
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '예산 설정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
