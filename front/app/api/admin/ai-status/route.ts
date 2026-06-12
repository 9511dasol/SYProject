import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { AIStatus } from '@/types/aiStatus';

/** BFF: 관리자 페이지에서 AI 프로바이더 현황(LLM_PROVIDER, 모델, API 키 설정 여부)을 조회한다. */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { data } = await privateApi.get<AIStatus>('/api/admin/ai-status');
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: 'AI 프로바이더 현황 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
