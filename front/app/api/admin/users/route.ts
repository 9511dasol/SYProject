import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { AdminUserCreatePayload, AdminUserItem } from '@/types/adminUsers';

/** BFF: 관리자 페이지에서 전체 계정 목록을 조회한다. */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { data } = await privateApi.get<AdminUserItem[]>('/api/admin/users');
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '계정 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

/** BFF: 관리자가 운영 계정을 직접 생성한다. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const body = (await request.json()) as AdminUserCreatePayload;

  try {
    const { data } = await privateApi.post<AdminUserItem>('/api/admin/users', body);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '계정 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
