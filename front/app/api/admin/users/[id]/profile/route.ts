import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';
import { auth } from '@/auth';
import { privateApi } from '@/lib/api/privateApi';
import type { AdminUserItem, AdminUserProfileUpdatePayload } from '@/types/adminUsers';

/** BFF: 관리자 페이지에서 계정의 이름 · 이메일을 변경한다. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as AdminUserProfileUpdatePayload;

  try {
    const { data } = await privateApi.patch<AdminUserItem>(`/api/admin/users/${id}/profile`, body);
    return NextResponse.json(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json({ message: '계정 정보 변경 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
