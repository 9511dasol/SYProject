import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { ReportResendResponse } from '@/types/reportLog';

/** BFF: 실패한 리포트 메일 발송 건을 같은 조건으로 재시도한다. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { data } = await privateApi.post<ReportResendResponse>(
      `/api/admin/report-logs/${encodeURIComponent(id)}/resend`,
    );
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '재발송 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
