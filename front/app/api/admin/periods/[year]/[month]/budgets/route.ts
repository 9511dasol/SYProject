import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { MediaBudgetsResponse } from '@/types/periodAdmin';

/** 백엔드 경로는 연/월이 path 파라미터라 두 라우트가 같은 문자열을 만든다. */
function budgetsPath(year: string, month: string): string {
  return `/api/admin/periods/${encodeURIComponent(year)}/${encodeURIComponent(month)}/budgets`;
}

function fail(err: unknown, message: string) {
  if (isAxiosError(err) && err.response) {
    return NextResponse.json(err.response.data, { status: err.response.status });
  }
  return NextResponse.json({ message }, { status: 500 });
}

/** BFF: 엑셀 summary '■ 매체별 예산'에 채울 값을 조회한다. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ year: string; month: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const { year, month } = await params;

  try {
    const { data } = await privateApi.get<MediaBudgetsResponse>(budgetsPath(year, month));
    return NextResponse.json(data);
  } catch (err) {
    return fail(err, '매체별 예산 조회 중 오류가 발생했습니다.');
  }
}

/** BFF: 해당 연월의 매체별 예산을 통째로 교체한다. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ year: string; month: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const { year, month } = await params;
  const body = await request.json();

  try {
    const { data } = await privateApi.put<MediaBudgetsResponse>(budgetsPath(year, month), body);
    return NextResponse.json(data);
  } catch (err) {
    return fail(err, '매체별 예산 저장 중 오류가 발생했습니다.');
  }
}
