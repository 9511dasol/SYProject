import { NextRequest, NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { AIToolUsageLogListResponse } from '@/types/aiUsageLog';

/** BFF: 관리자 페이지에서 AI 도구(이미지 정제 · 리사이저 AI 업스케일 · 헤딩 문구 추천) 사용 이력을 조회한다. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { data } = await privateApi.get<AIToolUsageLogListResponse>('/api/admin/ai-usage-logs', {
      params: Object.fromEntries(request.nextUrl.searchParams),
    });
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '사용 이력 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
