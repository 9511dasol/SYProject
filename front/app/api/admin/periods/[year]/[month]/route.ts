import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { PeriodDeleteResponse } from '@/types/periodAdmin';

/** BFF: 관리자 페이지에서 해당 연월의 데이터·코멘트·엑셀 원본을 모두 삭제한다. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ year: string; month: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const { year, month } = await params;

  try {
    const { data } = await privateApi.delete<PeriodDeleteResponse>(
      `/api/admin/periods/${encodeURIComponent(year)}/${encodeURIComponent(month)}`,
    );
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '기간 삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
