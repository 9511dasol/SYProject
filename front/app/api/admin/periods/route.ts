import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { PeriodOverviewResponse } from '@/types/periodAdmin';

/** BFF: 관리자 페이지에서 업로드된 연월별 데이터 현황을 조회한다. */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { data } = await privateApi.get<PeriodOverviewResponse>('/api/admin/periods');
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '기간 목록 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
